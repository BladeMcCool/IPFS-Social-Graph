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

    let pubkeyb64 = identities[selectedIdentity]["pub"]
    let privkeyb64 = identities[selectedIdentity]["priv"]

    let inputFlds = {
        "text" : document.getElementById("posttext").value.trim(),
        "dispname" : document.getElementById("dispname").value,
        "bio" : document.getElementById("bio").value,
        "graphtip" : document.getElementById("graphtip").value,
        "profiletip" : document.getElementById("profiletip").value,
        "inreplyto" : document.getElementById("inreplyto").value,
        "followprofileid" : document.getElementById("followprofileid").value,
        "unfollowprofileid" : document.getElementById("unfollowprofileid").value,
        "likeofnodecid" : document.getElementById("likeofnodecid").value,
        "unlikeofnodecid" : document.getElementById("unlikeofnodecid").value,
        "retractionofnodecid" : document.getElementById("retractionofnodecid").value,
        "repostofnodecid" : document.getElementById("repostofnodecid").value,
    }
    // pubkeyb64 = document.getElementById("pubkeyb64").innerHTML
    // text = document.getElementById("posttext").value.trim()
    // pubkeyb64 = identities[selectedIdentity]["pub"]
    // privkeyb64 = identities[selectedIdentity]["priv"]
    // dispname = document.getElementById("dispname").value
    // bio = document.getElementById("bio").value
    // graphtip = document.getElementById("graphtip").value
    // profiletip = document.getElementById("profiletip").value
    // inreplyto = document.getElementById("inreplyto").value
    // followprofileid = document.getElementById("followprofileid").value
    // unfollowprofileid = document.getElementById("unfollowprofileid").value
    // likeofnodecid = document.getElementById("likeofnodecid").value
    // unlikeofnodecid = document.getElementById("unlikeofnodecid").value
    // retractionofnodecid = document.getElementById("retractionofnodecid").value
    // repostofnodecid = document.getElementById("repostofnodecid").value
    //
    // sendprivkey = document.getElementById("sendprivkey").checked
    sendprivkey = false // disabling this for now. ipns publish is way to slow and this is super insecure anyway.

    let confirmFields = {
        "followprofileid":["follow", clearFollow],
        "unfollowprofileid":["unfollow", clearUnfollow],
        "retractionofnodecid":["retract", clearRetraction],
    }
    for (var key of Object.keys(confirmFields)) {
        clearFunc = confirmFields[key][1]
        clearFunc()
        if (inputFlds[key]) {
            confirmText = confirmFields[key][0]
            if (!confirm("really " + confirmText + " " + inputFlds[key] + "?")) {
                return
            }
        }
    }

    clearRepost()
    clearLike()
    clearUnlike()

    hasRequiredFld = false
    let requireOneOfFields = [
        "text", "followprofileid", "unfollowprofileid", "repostofnodecid", "retractionofnodecid", "likeofnodecid", "unlikeofnodecid",
    ]
    for (var i = 0; i < requireOneOfFields.length; i++) {
        if (inputFlds[requireOneOfFields[i]]) {
            hasRequiredFld = true
            break
        }
    }
    // if (followprofileid) {
    //     if (!confirm("really follow " + followprofileid + "?")) {
    //         return
    //     }
    //     clearFollow()
    // }
    // if (unfollowprofileid) {
    //     if (!confirm("really unfollow " + unfollowprofileid + "?")) {
    //         return
    //     }
    //     clearunFollow()
    // }
    // if (retractionofnodecid) {
    //     if (!confirm("really retract " + retractionofnodecid + "?")) {
    //         return
    //     }
    //     clearRetraction()
    // }


    // if (!text && !followprofileid && !unfollowprofileid && !repostofnodecid && !retractionofnodecid && !likeofnodecid && !unlikeofnodecid) {
    if (!hasRequiredFld) {
        alert("Please type some text for a post, follow/unfollow another profileid or otherwise set up some action to perform.")
        focusPostText()
        return
    }

    if (!inputFlds["text"] && inputFlds["inreplyto"]) {
        console.log("clearing replyto that had no text.")
        clearReply()
    }

    if (!inputFlds["graphtip"]) { inputFlds["graphtip"] = null; }
    if (!inputFlds["profiletip"]) { inputFlds["profiletip"] = null; }
    if (!inputFlds["inreplyto"]) { inputFlds["inreplyto"] = null; }
    if (!inputFlds["followprofileid"]) { inputFlds["followprofileid"] = null; }
    if (!inputFlds["unfollowprofileid"]) { inputFlds["unfollowprofileid"] = null; }
    if (!inputFlds["likeofnodecid"]) { inputFlds["likeofnodecid"] = null; }
    if (!inputFlds["unlikeofnodecid"]) { inputFlds["unlikeofnodecid"] = null; }
    if (!inputFlds["retractionofnodecid"]) { inputFlds["retractionofnodecid"] = null; }
    if (!inputFlds["repostofnodecid"]) { inputFlds["repostofnodecid"] = null; }

    useipnsdelegate = !sendprivkey

    let payloadFieldsForUnsignedGraphnode = {
        "text": inputFlds["text"],
        "previous": inputFlds["graphtip"],
        "inreplyto": inputFlds["inreplyto"],
        "followprofileid": inputFlds["followprofileid"],
        "unfollowprofileid": inputFlds["unfollowprofileid"],
        "likeofnodecid": inputFlds["likeofnodecid"],
        "unlikeofnodecid": inputFlds["unlikeofnodecid"],
        "retractionofnodecid": inputFlds["retractionofnodecid"],
        "repostofnodecid": inputFlds["repostofnodecid"],
    }

    unsignedGraphNodeJson = await getUnsignedGraphNodeForPost(pubkeyb64, payloadFieldsForUnsignedGraphnode)
    console.log("got unsigned gn like:", unsignedGraphNodeJson)
    signatureb64 = await getSignature(privkeyb64, unsignedGraphNodeJson)
    console.log("got signature b64 like:", signatureb64)
    unsignedProfileJson = await getUnsignedProfileWithFirstPost(pubkeyb64, unsignedGraphNodeJson, signatureb64, inputFlds["dispname"], inputFlds["bio"], inputFlds["profiletip"], useipnsdelegate)
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
    // console.log(latestTimelineTextsJson)
    displayTimelineTexts(latestTimelineTextsJson)
}

function unfollow(profileId) {
    //set the field and call the create post func.
    document.getElementById("unfollowprofileid").value = profileId
    createProfilePost()
}
function follow(profileId) {
    //set the field and call the create post func.
    document.getElementById("followprofileid").value = profileId
    createProfilePost()
}
function retract(cid) {
    document.getElementById("retractionofnodecid").value = cid
    createProfilePost()
}

function displayTimelineTexts(textsJson) {
    texts = JSON.parse(textsJson)
    target = document.getElementById("timeline")
    let selectedIdentityProfileId = ""
    if (selectedIdentity) {
        selectedIdentityProfileId = identities[selectedIdentity]["profileid"]
    }
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
        let showButtons = true
        if (node["publicfollow"] != undefined) {
            showButtons = false
            for (var j = 0; j < node["publicfollow"].length; j++) {
                ptag.title += "\nFollow of ProfileId: " + node["publicfollow"][j]
            }
        }
        // var textnode = document.createTextNode(texts[i]);
        text = node["Date"] + " " + "\u00A0".repeat(node["Indent"] * 8) + " " + node["DisplayName"] + ": " + node["PreviewText"] + "  "
        var textnode = document.createTextNode(text);
        ptag.appendChild(textnode);

        if (showButtons) {
            if (node["ProfileId"] != selectedIdentityProfileId && node["RepostOf"]) {
                //TODO also dont show a follow button on someone we already follow.
                addFollowButton(ptag, node["RepostOf"]["ProfileId"])
            }

            // addfollowButton(ptag, node["ProfileId"]) // only on reposteee that isnt on my follow list -- so, todo.
            if (node["ProfileId"] == selectedIdentityProfileId && !node["Retracted"]) {
                addRetractButton(ptag, node["Cid"])
            } else {
                console.log("no retracto b/c != ...", node["ProfileId"], "and", selectedIdentityProfileId)
            }
            addUnfollowButton(ptag, node["ProfileId"])

            if (!node["Retracted"]) {
                addReplyButton(ptag, node["Cid"])

                addRepostButton(ptag, node)
                addLikeButton(ptag, node["Cid"])
                addUnlikeButton(ptag, node["Cid"])
            }
        }

        target.appendChild(ptag);
    }
}

function makeATag(text, onclick) {
    var atag = document.createElement("a");
    atag.href = "#"
    atag.onclick = onclick
    atag.appendChild(document.createTextNode("[" + text +  "]"))
    return atag
}

function addUnfollowButton(ptag, profileId) {
    ptag.appendChild(makeATag("Unf", function(profileId){ return function(){
        unfollow(profileId)
        focusPostText()
        return false;
    }}(profileId)))
}
function addFollowButton(ptag, profileId) {
    ptag.appendChild(makeATag("F", function(profileId){ return function(){
        follow(profileId)
        focusPostText()
        return false;
    }}(profileId)))
}
function addRetractButton(ptag, cid) {
    ptag.appendChild(makeATag("Retract", function(cid){ return function(){
        retract(cid)
        focusPostText()
        return false;
    }}(cid)))
}

function addReplyButton(ptag, cid) {
    ptag.appendChild(makeATag("Reply", function(cid){ return function(){
        document.getElementById("inreplyto").value = cid
        focusPostText()
        return false;
    }}(cid)))
}

function addRepostButton(ptag, graphnode) {
    let cid = graphnode["Cid"]
    if (graphnode["RepostOfNodeCid"]) {
        cid = graphnode["RepostOfNodeCid"]
    }
    ptag.appendChild(makeATag("Repost", function(cid){ return function(){
        document.getElementById("repostofnodecid").value = cid
        focusPostText()
        return false;
    }}(cid)))
}

function addLikeButton(ptag, cid) {
    ptag.appendChild(makeATag("Like", function(cid){ return function(){
        document.getElementById("likeofnodecid").value = cid
        focusPostText()
        return false;
    }}(cid)))
}
function addUnlikeButton(ptag, cid) {
    ptag.appendChild(makeATag("Unlike", function(cid){ return function(){
        document.getElementById("unlikeofnodecid").value = cid
        focusPostText()
        return false;
    }}(cid)))
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

function clearUnfollow() {
    document.getElementById("unfollowprofileid").value = ""
}
function clearRetraction() {
    document.getElementById("retractionofnodecid").value = ""
}
function clearRepost() {
    document.getElementById("repostofnodecid").value = ""
}
function clearLike() {
    document.getElementById("likeofnodecid").value = ""
}
function clearUnlike() {
    document.getElementById("unlikeofnodecid").value = ""
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