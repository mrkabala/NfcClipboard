(function () {
    "use strict";

    var app = WinJS.Application;
    var activation = Windows.ApplicationModel.Activation;
    var proximityDevice = null;
    var subscribedMessageId = null;
    var messageDiv = null;
    var showNoTextMessage = true;

    function clearMessageDiv() {
        while (messageDiv && messageDiv.hasChildNodes()) messageDiv.removeChild(messageDiv.firstChild);
    }

    function initializeProximityDevice() {
        proximityDevice = Windows.Networking.Proximity.ProximityDevice.getDefault();

        if (proximityDevice != null)  return true;
        else return false;
    }

    function proximityDeviceArrived(device) {
        clearMessageDiv();
        messageDiv.appendChild(document.createTextNode("Tag arrived."));
        messageDiv.appendChild(document.createElement("br"));

        showNoTextMessage = true;
    }

    function proximityDeviceDeparted(device) {
        if (showNoTextMessage) {
            messageDiv.appendChild(document.createElement("br"));
            messageDiv.appendChild(document.createTextNode("No text found."));
            showNoTextMessage = false;
        }

        messageDiv.appendChild(document.createElement("br"));
        messageDiv.appendChild(document.createTextNode("Scan another tag to replace clipboard contents."));
        messageDiv.appendChild(document.createElement("br"));
        messageDiv.appendChild(document.createElement("br"));
    } 

    function isMessageBegin(recordFlags) {
        return ((recordFlags & 0x80) != 0);
    }

    function isMessageEnd(recordFlags) {
        return ((recordFlags & 0x40) != 0);
    }

    function isChunkedFormat(recordFlags) {
        return ((recordFlags & 0x20) != 0);
    }

    function isShortRecord(recordFlags) {
        return ((recordFlags & 0x10) != 0);
    }

    function hasIdLength(recordFlags) {
        return ((recordFlags & 0x08) != 0);
    }

    function typeNameFormat(recordFlags) {
        return recordFlags & 0x07;
    }

    function getTextFromArray(textArray, textEncoding) {
        var textString = "";
        var i = null;
        var textLength = textArray.length;
        if (textEncoding == "UTF16") {
            for (i = 0; i < textLength; i += 2) {
                textString += String.fromCharCode(textArray[i] + (256 * textArray[i + 1]));
            }
        } else {
            for (i = 0; i < textLength; i++) textString += String.fromCharCode(textArray[i]);
        }
        return textString;
    }

    function copyTextToClipboard(textString) {
        var clipboard = Windows.ApplicationModel.DataTransfer.Clipboard;
        var dataPackage = new Windows.ApplicationModel.DataTransfer.DataPackage();
        dataPackage.setData(Windows.ApplicationModel.DataTransfer.StandardDataFormats.text, textString);
        clipboard.setContent(dataPackage);
    }

    function ndefTagReceived(device, message) {
        var dataReader = Windows.Storage.Streams.DataReader.fromBuffer(message.data);
        var messageBytes = "";
        var messageText = "";
        var messageArray = new Array;

        messageDiv.appendChild(document.createElement("br"));
        messageDiv.appendChild(document.createTextNode("NFC Tag detected."));
        messageDiv.appendChild(document.createElement("br"));

        for (var i = 0; i < message.data.length; i++) {
            messageArray[i] = dataReader.readByte();
        }

        var ndefRecordCount = 0;
        var lastLength = 0;
        while (messageArray.length > 2) {
            ndefRecordCount++;

            var messageOffset = 0;
            var recordFlags = messageArray[messageOffset++];
            var typeLength = 0;
            var typeString = "";
            var textStatus = null;
            var idType = null;
            var idLength = 0;
            var payloadLength = 0;
            var payloadArray = new Array;
            var payloadString = "";
            var validRecord = false;

            typeLength = messageArray[messageOffset++];
            payloadLength = 0;
            if (isShortRecord(recordFlags)) {
                payloadLength += messageArray[messageOffset++];
            } else {
                for (i = 0; i<4; i++) {
                    payloadLength *= 256;
                    payloadLength += messageArray[messageOffset++];
                }
            }
            if (hasIdLength(recordFlags)) idLength = messageArray[messageOffset++];

            for (i = 0; i < typeLength; i++) {
                typeString += String.fromCharCode(messageArray[i + messageOffset]);
            }
            messageOffset += typeLength;

            for (i = 0; i < payloadLength; i++) {
                payloadArray[i] = messageArray[i + messageOffset];
            }
            messageOffset += payloadLength;

            messageArray = messageArray.slice(messageOffset, messageArray.length);

            if (typeNameFormat(recordFlags) == 0x01) { // NFC Forum Well Known Type
                if (typeString == "T") {
                    textStatus = payloadArray[0];
                    payloadArray = payloadArray.slice(1);
                    --payloadLength;

                    var textEncoding = (textStatus & 0x01) ? "UTF16" : "UTF8";
                    var ianaLength = textStatus & 0x3F;

                    var languageCode = "";
                    for (i = 0; i < ianaLength; i++) {
                        languageCode += String.fromCharCode(payloadArray[0]);
                        payloadArray = payloadArray.slice(1);
                        --payloadLength;
                    }

                    payloadString = getTextFromArray(payloadArray, textEncoding);
                    copyTextToClipboard(payloadString)
                    showNoTextMessage = false;
                    messageDiv.appendChild(document.createTextNode("Record " + ndefRecordCount + " text copied to clipboard. (" + payloadLength + " bytes)"));
                    messageDiv.appendChild(document.createElement("br"));
                } else if (typeString == "U") {
                    idType = payloadArray[0];
                    payloadArray = payloadArray.slice(1);
                    --payloadLength;

                    payloadString = getTextFromArray(payloadArray, "UTF8");
                    if (payloadString.substr(0, 25) == "lastpass.com/mobile/?otp=") {
                        copyTextToClipboard(payloadString.substr(25))
                        showNoTextMessage = false;
                        messageDiv.appendChild(document.createTextNode("Password token detected."));
                        messageDiv.appendChild(document.createElement("br"));
                        messageDiv.appendChild(document.createTextNode("One-time Password copied to clipboard. (" + (payloadLength - 25) + " bytes)"));
                        messageDiv.appendChild(document.createElement("br"));
                    }
                }
            } else if (typeNameFormat(recordFlags) == 0x02) { // Media Type 
                if (typeString == "text/plain") {
                    payloadString = getTextFromArray(payloadArray, "UTF16");
                    copyTextToClipboard(payloadString);
                    showNoTextMessage = false;
                    messageDiv.appendChild(document.createTextNode("Record " + ndefRecordCount + " text copied to clipboard. (" + payloadLength + " bytes)"));
                    messageDiv.appendChild(document.createElement("br"));
                }
            }
            if (lastLength && messageArray.length == lastLength) {
                messageArray = {};
            } else {
                lastLength = messageArray.length;
            }
        }
        if (showNoTextMessage) {
            messageDiv.appendChild(document.createTextNode("No text found."));
            messageDiv.appendChild(document.createElement("br"));
            showNoTextMessage = false;
        }
    }

    function initButtonClicked(e) {
        clearMessageDiv();

        if (initializeProximityDevice()) {
            messageDiv.appendChild(document.createTextNode("Proximity device initialized."));
            messageDiv.appendChild(document.createElement("br"));
            messageDiv.appendChild(document.createTextNode("Scan tag to copy text to clipboard."));
            messageDiv.appendChild(document.createElement("br"));

            document.getElementById("initbutton").style.display = "none";
            document.getElementById("viewbutton").style.display = "inline";
            document.getElementById("clearbutton").style.display = "inline";

            proximityDevice.addEventListener("devicearrived", proximityDeviceArrived);
            proximityDevice.addEventListener("devicedeparted", proximityDeviceDeparted);
            subscribedMessageId = proximityDevice.subscribeForMessage("NDEF", ndefTagReceived);
        } else {
            var messageDialog = new Windows.UI.Popups.MessageDialog("Please attach your NFC Reader.");
            messageDialog.title = "Failed to initialized proximity device.";
            messageDialog.showAsync();

            clearMessageDiv();
            messageDiv.appendChild(document.createTextNode("Please attach your NFC Reader."));
            messageDiv.appendChild(document.createElement("br"));
            messageDiv.appendChild(document.createTextNode("Click Initialize button when done."));
            messageDiv.appendChild(document.createElement("br"));

            document.getElementById("initbutton").style.display = "inline";
            document.getElementById("viewbutton").style.display = "none";
            document.getElementById("clearbutton").style.display = "none";
        }
    }

    function viewButtonClicked(e) {
        var clipboard = Windows.ApplicationModel.DataTransfer.Clipboard;
        var dataPackage = clipboard.getContent();
        var textFormatFound = false;
        for (var i = 0; i < dataPackage.availableFormats.size; i++) {
            var currentFormat = dataPackage.availableFormats[i];
            if (currentFormat == "Text") textFormatFound = true;
        }
        if (textFormatFound) {
            dataPackage.getTextAsync().done(function (text) {
                var messageDialog = new Windows.UI.Popups.MessageDialog(text);
                messageDialog.title = "Clipboard Contents:";
                messageDialog.showAsync();
            });
        } else {
            var messageDialog = new Windows.UI.Popups.MessageDialog("");
            messageDialog.title = "Clipboard is empty.";
            messageDialog.showAsync();
        }
    }

    function clearButtonClicked(e) {
        var clipboard = Windows.ApplicationModel.DataTransfer.Clipboard;
        clipboard.clear();
        clearMessageDiv();
        messageDiv.appendChild(document.createTextNode("Clipboard has been cleared."));
        messageDiv.appendChild(document.createElement("br"));
    }

    function init() {
        if (initializeProximityDevice()) {
            clearMessageDiv();
            messageDiv.appendChild(document.createTextNode("Proximity device initialized."));
            messageDiv.appendChild(document.createElement("br"));
            messageDiv.appendChild(document.createTextNode("Scan tag to copy text to clipboard."));
            messageDiv.appendChild(document.createElement("br"));

            document.getElementById("initbutton").style.display = "none";
            document.getElementById("viewbutton").style.display = "inline";
            document.getElementById("clearbutton").style.display = "inline";

            proximityDevice.addEventListener("devicearrived", proximityDeviceArrived);
            proximityDevice.addEventListener("devicedeparted", proximityDeviceDeparted);
            subscribedMessageId = proximityDevice.subscribeForMessage("NDEF", ndefTagReceived);
        } else {
            clearMessageDiv();
            messageDiv.appendChild(document.createTextNode("Please attach your NFC Reader."));
            messageDiv.appendChild(document.createElement("br"));
            messageDiv.appendChild(document.createTextNode("Click Initialize button when done."));
            messageDiv.appendChild(document.createElement("br"));

            document.getElementById("initbutton").style.display = "inline";
            document.getElementById("viewbutton").style.display = "none";
            document.getElementById("clearbutton").style.display = "none";
        }

        document.getElementById("initbutton").addEventListener("click", initButtonClicked);
        document.getElementById("viewbutton").addEventListener("click", viewButtonClicked);
        document.getElementById("clearbutton").addEventListener("click", clearButtonClicked);
    }

    function resumingHandler() {
        // TODO: Refresh network data
        clearMessageDiv();
        messageDiv.appendChild(document.createTextNode("Resuming from suspend ..."));
        messageDiv.appendChild(document.createElement("br"));
        messageDiv.appendChild(document.createElement("br"));

        proximityDevice = null;
        document.getElementById("initbutton").removeEventListener("click", initButtonClicked);
        document.getElementById("viewbutton").removeEventListener("click", viewButtonClicked);
        document.getElementById("clearbutton").removeEventListener("click", clearButtonClicked);

        init();
    }

    app.onactivated = function (args) {
        Windows.UI.WebUI.WebUIApplication.addEventListener("resuming", resumingHandler, false);
        messageDiv = document.getElementById("messageDiv");

        if (args.detail.kind === activation.ActivationKind.launch) {
            if (args.detail.previousExecutionState !== activation.ApplicationExecutionState.terminated) {
                // TODO: This application has been newly launched. Initialize
                // your application here.
            } else {
                // TODO: This application has been reactivated from suspension.
                // Restore application state here.
            }

            init();
            args.setPromise(WinJS.UI.processAll());
        }
    };

    app.oncheckpoint = function (args) {
        // TODO: This application is about to be suspended. Save any state
        // that needs to persist across suspensions here. You might use the
        // WinJS.Application.sessionState object, which is automatically
        // saved and restored across suspension. If you need to complete an
        // asynchronous operation before your application is suspended, call
        // args.setPromise().
    };

    app.onunload = function (args) {
        // TODO: This application is about to be suspended. Save any state
        // that needs to persist across suspensions here. You might use the
        // WinJS.Application.sessionState object, which is automatically
        // saved and restored across suspension. If you need to complete an
        // asynchronous operation before your application is suspended, call
        // args.setPromise().
    };

    app.start();
})();
