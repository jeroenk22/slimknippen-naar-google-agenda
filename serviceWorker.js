console.log('moiiii');
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('hallo');
    console.log('message.action: ', message.action)
    if (message.action === 'getAuthToken') {
        chrome.identity.getAuthToken({ interactive: true }, token => {
            console.log('getauthtoken is: ', chrome.identity.getAuthToken());
            if (chrome.runtime.lastError || !token) {
                console.error('Fout bij ophalen token in background.js:', chrome.runtime.lastError);
                sendResponse({ success: false, error: chrome.runtime.lastError });
            } else {
                console.log('Token opgehaald in background.js:', token);
                sendResponse({ success: true, token });
            }
        });
        return true; // Houd de verbinding open voor een async response
    }
});