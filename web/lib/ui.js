var identities
var selectedIdentity
var importPubkey

async function reloadSession() {
    await loadServiceBaseUrl()
    console.log('localforage is: ', localforage);
    console.log('reloadSession: identities is: ', identities);
    try {
        identities = await localforage.getItem('identities');
        selectedIdentity = await localforage.getItem('selectedIdentity');
        console.log("identities already there", identities);
        console.log("selectedIdentity already there", selectedIdentity);
    } catch (err) {
        console.log("load oops:", err);
    }
    if (!identities) {
        console.log("no existing identities found in indexeddb");
        identities = {}
        return
    }
    if (!identities[selectedIdentity]) {
        selectedIdentity = null
    }
    for (var idname of Object.keys(identities)) {
        addIdentityToChoices(idname)
    }
    setIdentity(selectedIdentity)
}

async function createProfilePost() {
    if (!selectedIdentity) {
        alert("select an identity first please")
        return
    }

    // pubkeyb64 = document.getElementById("pubkeyb64").innerHTML
    text = document.getElementById("posttext").value.trim()
    pubkeyb64 = identities[selectedIdentity]["pub"]
    privkeyb64 = identities[selectedIdentity]["priv"]
    dispname = document.getElementById("dispname").value
    bio = document.getElementById("bio").value
    graphtip = document.getElementById("graphtip").value
    profiletip = document.getElementById("profiletip").value
    inreplyto = document.getElementById("inreplyto").value
    followprofileid = document.getElementById("followprofileid").value
    sendprivkey = document.getElementById("sendprivkey").checked


    if (followprofileid) {
        if (!confirm("really follow " + followprofileid + "?")) {
            return
        }
        clearFollow()
    }

    if (!text && !followprofileid) {
        alert("Please type some text for a post or follow another profileid")
        focusPostText()
        return
    }

    if (!text && inreplyto) {
        console.log("clearing replyto that had no text.")
        clearReply()
    }

    if (!graphtip) { graphtip = null; }
    if (!profiletip) { profiletip = null; }
    if (!inreplyto) { inreplyto = null; }
    if (!followprofileid) { followprofileid = null; }

    useipnsdelegate = !sendprivkey

    unsignedGraphNodeJson = await getUnsignedGraphNodeForPost(pubkeyb64, text, graphtip, inreplyto, followprofileid)
    console.log("got unsigned gn like:", unsignedGraphNodeJson)
    signatureb64 = await getSignature(privkeyb64, unsignedGraphNodeJson)
    console.log("got signature b64 like:", signatureb64)
    unsignedProfileJson = await getUnsignedProfileWithFirstPost(pubkeyb64, unsignedGraphNodeJson, signatureb64, dispname, bio, profiletip, useipnsdelegate)
    console.log("got unsigned profile json like:", unsignedProfileJson)
    unsignedProfile = JSON.parse(unsignedProfileJson)
    document.getElementById("graphtip").value = unsignedProfile.GraphTip
    document.getElementById("profileid").value = unsignedProfile.Id
    document.getElementById("ipnsdelegate").value = unsignedProfile.IPNSDelegate ? unsignedProfile.IPNSDelegate : ""

    profileSigb64 = await getSignature(privkeyb64, unsignedProfileJson)
    console.log("got signature for that like:", profileSigb64)
    privkeyb64foripns = sendprivkey ? privkeyb64 : null
    publishedProfileCid = await getPublishedProfileCid(pubkeyb64, privkeyb64foripns, unsignedProfileJson, profileSigb64)
    document.getElementById("profiletip").value = publishedProfileCid

    scrapeSettingsIntoSelectedIdentity() //so that when we updateSavedIdentites we keep whatever was in the fields.
    await updateSavedIdentites(identities)

    document.getElementById("posttext").value = ""
    clearReply()
    clearFollow()

    latestTimelineTextsJson = await getLatestTimelineTexts(pubkeyb64, publishedProfileCid)
    console.log(latestTimelineTextsJson)
    displayTimelineTexts(latestTimelineTextsJson)
}

function displayTimelineTexts(textsJson) {
    texts = JSON.parse(textsJson)
    target = document.getElementById("timeline")
    target.textContent = "" //apparently not the worst way to make all the existing child elements go away before we render the updated history.
    for (var i = 0; i < texts.length; i++) {
        console.log("adding this", texts[i])
        node = texts[i]
        var ptag = document.createElement("p");
        ptag.title = "ProfileId: " + node["ProfileId"] + "\nGraphNode cid: " + node["Cid"] + "\nGraphNode previous: " + node["previous"]
        if (node["post"] != undefined) {
            if (node["post"]["Reply"] != undefined) {
                for (var j = 0; j < node["post"]["Reply"].length; j++) {
                    ptag.title += "\nReply to GraphNode cid: " + node["post"]["Reply"][j]
                }
            }
            ptag.title += "\nPost Content Cid: " + node["post"]["Cid"]
        }
        if (node["publicfollow"] != undefined) {
            for (var j = 0; j < node["publicfollow"].length; j++) {
                ptag.title += "\nFollow of ProfileId: " + node["publicfollow"][j]
            }
        }
        // var textnode = document.createTextNode(texts[i]);
        text = node["Date"] + " " + "\u00A0".repeat(node["Indent"] * 8) + " " + node["DisplayName"] + ": " + node["PreviewText"] + "  "
        var textnode = document.createTextNode(text);
        ptag.appendChild(textnode);
        var atag = document.createElement("a");
        atag.href = "#"
        atag.onclick = function(cid){ return function(){
            document.getElementById("inreplyto").value = cid
            focusPostText()
            return false;
        }}(node["Cid"])
        atag.appendChild(document.createTextNode("[Reply]"))
        ptag.appendChild(atag)
        target.appendChild(ptag);
    }
}
function focusPostText() {
    document.getElementById("posttext").focus()
}

function clearIdentName() {
    document.getElementById("newidentname").value = ""
}
function clearReply() {
    document.getElementById("inreplyto").value = ""
}
function clearFollow() {
    document.getElementById("followprofileid").value = ""
}

function setEnterButtonAction(){
    document.onkeydown = function (e) {
        e = e || window.event;
        switch (e.which || e.keyCode) {
            case 13 : //Your Code Here (13 is ascii code for 'ENTER')
                createProfilePost()
                break;
        }
    }
}

myOnload = async function() {
    await reloadSession()
    setEnterButtonAction()
    focusPostText()
}

window.addEventListener('DOMContentLoaded', myOnload, false);