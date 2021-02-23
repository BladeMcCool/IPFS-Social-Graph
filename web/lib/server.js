var serviceBaseUrl = ""

async function loadServiceBaseUrl() {
    try {
        serviceBaseUrl = await localforage.getItem('serviceBaseUrl');
    } catch (err) {
        console.log("loadServiceBaseUrl load oops:", err);
    }
    if (!serviceBaseUrl) {
        console.log("no serviceBaseUrl, setting from window.location info")
        var getUrl = window.location;
        serviceBaseUrl = getUrl.protocol + "//" + getUrl.host
    }
    document.getElementById("servicebaseurl").value = serviceBaseUrl
    console.log("loadServiceBaseUrl: serviceBaseUrl is set to", serviceBaseUrl)
}
async function saveServiceBaseUrl() {
    serviceBaseUrl = document.getElementById("servicebaseurl").value.trim()
    console.log("saveServiceBaseUrl: serviceBaseUrl is set to", serviceBaseUrl)
    try {
        await localforage.setItem('serviceBaseUrl', serviceBaseUrl);
        console.log("saveServiceBaseUrl: updated serviceBaseUrl indexeddb to", serviceBaseUrl);
    } catch (err) {
        console.log("failed to set serviceBaseUrl indexeddb ??", err);
    }
}

async function cancelCurrentHistoryRequest() {
    historyXhr = requestTracker[serviceBaseUrl + "/service/history"]
    if (historyXhr == undefined) { return }
    console.log("aborting current history request")
    historyXhr.abort()
}


async function getUnsignedGraphNodeForPost(pubkeyb64, text, previous, inreplyto, followprofileid) {
    if (pubkeyb64 == null || text == null) {
        console.log("get unsigned graphnode: no data - do nothing")
        return
    }
    console.log("hrm1", previous)
    if (!previous) {
        previous = null
    }
    payload = {"pubkey":pubkeyb64, "text":text, "previous":previous, "inreplyto":inreplyto, "followprofileid":followprofileid}
    console.log("send get unsignedGraphNodeForPost payload like", JSON.stringify(payload))
    result = await makeRequest("POST", serviceBaseUrl + "/service/unsignedGraphNodeForPost", payload)
    return result
}

async function getUnsignedProfileWithFirstPost(pubkeyb64, unsignedGraphNodeJson, signatureb64, displayname, bio, previous, useipnsdelegate) {
    if (pubkeyb64 == null || unsignedGraphNodeJson == null || signatureb64 == null) {
        console.log("get unsigned profle: no data - do nothing")
        return
    }
    if (!displayname) {
        displayname = ""
    }
    if (!bio) {
        bio = ""
    }
    if (!previous) {
        previous = null
    }
    if (!useipnsdelegate) {
        useipnsdelegate = false
    }
    payload = {"pubkey":pubkeyb64, "useipnsdelegate": useipnsdelegate, "unsignedGraphNodeJson":unsignedGraphNodeJson, "signatureb64":signatureb64, "displayname":displayname, "bio":bio, "previous": previous}
    console.log("send payload to unsignedProfileWithFirstPost (method2) like", JSON.stringify(payload))
    result = await makeRequest("POST", serviceBaseUrl + "/service/unsignedProfileWithFirstPost", payload)
    console.log("got unsignedProfileWithFirstPost (method2) result like:", result)
    return result
}

async function getPublishedProfileCid(pubkeyb64, privkeyb64, unsignedProfileJson, profileSigb64) {
    console.log("getPublishedProfileCid...")
    if (pubkeyb64 == null || unsignedProfileJson == null || profileSigb64 == null) {
        console.log("get published profile cid: no data - do nothing")
        return
    }
    if (!profiletip) {
        profiletip = null
    }
    if (!profiletip) {
        profiletip = null
    }
    if (!privkeyb64) {
        privkeyb64 = null
    }

    //TODO check that we are either served by ssl or local file ???
    console.log("we are sending the private key to the server so it can do ipns... so be on ssl. ... ")

    payload = {"pubkey":pubkeyb64, "privkey":privkeyb64, "unsignedProfileJson":unsignedProfileJson, "signatureb64":profileSigb64}
    console.log("send payload to method3 like", payload)
    result = await makeRequest("POST", serviceBaseUrl + "/service/publishedProfileCid", payload)
    console.log("got method3 result like:", result)
    return result
}

async function getLatestTimelineTexts(pubkeyb64, profiletip) {
    console.log("getLatestTimelineTexts...")
    if (pubkeyb64 == null || !profiletip) {
        console.log("getLatestTimelineTexts: no data - do nothing")
        return "[]"
    }
    payload = {"pubkey":pubkeyb64, "profiletip":profiletip}
    console.log("send payload to get history like", payload)
    result = await makeRequest("POST", serviceBaseUrl + "/service/history", payload, true)
    // console.log("got history result like:", result)
    return result
}


var requestTracker = {}
function makeRequest(method, url, payload, track) {
    //thank you mister https://jacoby.github.io/js/2018/10/04/field-notes-on-vanilla-javascript-and-asyncawait-with-xhr.html, such convenience.
    if (!track) {
        track = false
    }

    return new Promise(function(resolve, reject) {
        let xhr = new XMLHttpRequest();
        if (track) {
            requestTracker[url] = xhr
        }
        xhr.open(method, url);
        xhr.setRequestHeader("X-Pubkey-B64", identities[selectedIdentity]["pub"]);
        xhr.onload = function() {
            if (this.status >= 200 && this.status < 300) {
                resolve(xhr.response);
            } else {
                reject({
                    status: this.status,
                    statusText: xhr.statusText
                });
            }
        };
        xhr.onerror = function() {
            reject({
                status: this.status,
                statusText: xhr.statusText
            });
        };
        if (payload != null) {
            console.log("do json submit")
            xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
            xhr.send(JSON.stringify(payload));
            return
        }
        xhr.send();
    });
}
