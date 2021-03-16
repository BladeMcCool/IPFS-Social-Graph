var identities
var selectedIdentity
var importPubkey
let selectedIdentityProfileId
let timelineUpdaterInterval

let tlEntryTemplate

let orderedTimelineElements = []
let retractedCids = {} //map cid to person who retracted it. just need to only retract things that are done by their owners.
let gnReplyParents = {}
let repostedCids = {}
let followeeProfiles = {}
let follows = {}
let unfollows = {}
let followButtons = {}
let noTsGnodes = {}
let profileTipCache = {}
let gnOfInterestByProfileId = {}

function resetTextTimelineArea() {
    let target = document.getElementById("tlcontainer")
    target.textContent = "" //apparently not the worst way to make all the existing child elements go away before we render the updated history.
    orderedTimelineElements = []
    gnReplyParents = {}
    repostedCids = {}
    follows = {}
    unfollows = {}
    noTsGnodes = {}
    profileTipCache = {}
    gnOfInterestByProfileId = {}
    followeeProfiles = {}
}

function setSelectedIdentityProfileId() {
    if (selectedIdentity) {
        selectedIdentityProfileId = identities[selectedIdentity]["profileid"]
    } else {
        selectedIdentityProfileId = null
    }
}

async function reloadSession() {
    await loadServiceBaseUrl()
    console.log('localforage is: ', localforage);
    console.log('reloadSession: identities is: ', identities);
    try {
        identities = await localforage.getItem('identities');
        selectedIdentity = await localforage.getItem('selectedIdentity');
        setSelectedIdentityProfileId()
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
        setSelectedIdentityProfileId()
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

    // unsignedGraphNodeJson = await getUnsignedGraphNodeForPost(pubkeyb64, payloadFieldsForUnsignedGraphnode)
    unsignedGraphNodeJson = await unsignedGraphNodeForPost(
        pubkeyb64,
        inputFlds["text"],
        inputFlds["graphtip"],
        inputFlds["inreplyto"],
        inputFlds["followprofileid"],
        inputFlds["unfollowprofileid"],
        inputFlds["likeofnodecid"],
        inputFlds["unlikeofnodecid"],
        inputFlds["retractionofnodecid"],
        inputFlds["repostofnodecid"]
    )
    console.log("got unsigned gn like:", unsignedGraphNodeJson)
    signatureb64 = await getSignature(privkeyb64, unsignedGraphNodeJson)
    console.log("got signature b64 like:", signatureb64)

    // unsignedProfileJson = await getUnsignedProfileWithFirstPost(pubkeyb64, unsignedGraphNodeJson, signatureb64, inputFlds["dispname"], inputFlds["bio"], inputFlds["profiletip"], useipnsdelegate)
    unsignedProfileJson = await unsignedProfileWithFirstPost(pubkeyb64, unsignedGraphNodeJson, signatureb64, inputFlds["dispname"], inputFlds["bio"], inputFlds["profiletip"], useipnsdelegate)
    console.log("got unsigned profile json like:", unsignedProfileJson)

    unsignedProfile = JSON.parse(unsignedProfileJson)
    document.getElementById("graphtip").value = unsignedProfile.GraphTip
    document.getElementById("profileid").value = unsignedProfile.Id
    document.getElementById("ipnsdelegate").value = unsignedProfile.IPNSDelegate ? unsignedProfile.IPNSDelegate : ""

    profileSigb64 = await getSignature(privkeyb64, unsignedProfileJson)
    console.log("got signature for that like:", profileSigb64)
    privkeyb64foripns = sendprivkey ? privkeyb64 : null
    // updatedProfileCid = await getPublishedProfileCid(pubkeyb64, privkeyb64foripns, unsignedProfileJson, profileSigb64)
    updatedProfileCid = await publishedProfileCid(pubkeyb64, unsignedProfileJson, profileSigb64)
    document.getElementById("profiletip").value = updatedProfileCid

    scrapeSettingsIntoSelectedIdentity() //so that when we updateSavedIdentites we keep whatever was in the fields.
    await updateSavedIdentites(identities)

    if (inputFlds["followprofileid"]) {
        delete unfollows[inputFlds["followprofileid"]] //otherwise spidering code will not re-add anything that was previously unfollowed.
    }
    // followprofileid
    // unfollowprofileid
    // getFolloweeProfileInfo

    document.getElementById("posttext").value = ""
    clearReply()
    clearFollow()

    // latestTimelineTextsJson = await getLatestTimelineTexts(pubkeyb64, updatedProfileCid)
    // console.log(latestTimelineTextsJson)
    // displayTimelineTextsFromServer(latestTimelineTextsJson)
    // await loadJsTimeline()
    await updateJsTimeline()
}

async function loadServerHistory() {
    if (!confirm("actually load history from server?")) {
        return
    }
    let identity = identities[selectedIdentity]
    displayTimelineTextsFromServer("[]")
    let latestTimelineTextsJson = await getLatestTimelineTexts(identity["pub"], identity["profiletip"])
    displayTimelineTextsFromServer(latestTimelineTextsJson)
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

function hideFollowButtonsForProfileId(followProfileId) {
    if (!followButtons[followProfileId] || followButtons[followProfileId].length == 0) {
        return
    }
    for (let i = 0; i < followButtons[followProfileId].length; i++) {
        followButtons[followProfileId][i].style = "display: none"
    }
}


function addGnToTimeline(gnode) {
    // let checkEntry = entry

    let foundTs = gnode.Date ? gnode.Date : (gnode.post ? gnode.post.Date : undefined)
    // let addSec = 0
    // while (!foundTs) {
    //     checkEntry = checkEntry.prev
    //     if (!checkEntry) { break }
    //     foundTs = checkEntry.Date
    //     addSec++
    // }
    if (!foundTs) {
        addNoTsGnode(gnode)
        foundTs = "0001-01-01T00:00:00Z"
    } else {
        fixMissingTsItemsRelatedTo(gnode.ProfileId, foundTs)
    }
    console.log(`addGnToTimeline, using ts ${foundTs}`, gnode)
    gnode.jsDate = new Date(foundTs) //new Date(tsDate.getTime() + sec); //<-- example of how to add time to a date.

    prepareDomElements(gnode)

    if (gnode.retraction) {
        //we just need to keep track of these as they come in.
        //and as other things come in, we need to check against this list to decide on the suppression.
        console.log(`retraction of ${gnode.retraction} by ${gnode.ProfileId}`)
        if (!retractedCids[gnode.retraction]) {
            retractedCids[gnode.retraction] = {}
        }
        retractedCids[gnode.retraction][gnode.ProfileId] = true

        //i want to see if any already-inserted posts or reposts have content which was retracted by this retraction.
        if (gnReplyParents[gnode.retraction] && (gnReplyParents[gnode.retraction].ProfileId == gnode.ProfileId)) {
            //the retracted cid is mentioned in the replyparents (aka cid->gnode map) and the profileId on that retracted node matches the profileId trying to do the retraction ...
            gnReplyParents[gnode.retraction].PreviewText = "[RETRACTED]"
            updateTimelinePost(gnReplyParents[gnode.retraction])
        }
        if (repostedCids[gnode.retraction] && (repostedCids[gnode.retraction].repostGn.ProfileId == gnode.ProfileId)) {
            //the retracted cid is mentioned among the known reposted cids and the profileId which owns the content that was reposted is the one that retracted it here.
            repostedCids[gnode.retraction].RepostPreviewText = "[RETRACTED]"
            updateTimelineRepost(repostedCids[gnode.retraction])
        }

    }

    performDomInsertion(gnode)
}

function performDomInsertion(gnode) {
    let includeInMainTl = false
    if (gnode.post && (!gnode.post.Reply || gnode.post.Reply.length == 0)) {
        includeInMainTl = true
    }
    if (gnode.repost) {
        includeInMainTl = true
    }
    if (gnode.ProfileId == selectedIdentityProfileId && gnode.publicfollow && gnode.publicfollow.length > 0) {
        includeInMainTl = true
    }

    if (includeInMainTl) {
        gnode.includeInMainTl = true
        let mainTlcompare = (a, b) => {
            return a.jsDate > b.jsDate ? -1 : 1
        }
        xbinaryInsert(orderedTimelineElements, gnode, mainTlcompare, domBlaster)
        return
    }

    if (gnode.post && gnode.post.Reply && gnode.post.Reply.length > 0) {
        //put reply stuff under the node it is replying to, which might not actually exist yet, in which case use a placeholder. if we use a placeholder, when the real reply parent is inserted, it should take any replies from the dummy if it exists.
        for (let i = 0; i < gnode.post.Reply.length; i++) {
            let replyTo = gnode.post.Reply[i]
            let replyParent = gnReplyParents[replyTo]
            if (!replyParent) {
                replyParent = {
                    Cid: replyTo,
                    replies : [],
                    domElements: {
                        replyContainer: createReplyContainerDiv()
                    },
                    dummyParent: true
                }
                gnReplyParents[replyTo] = replyParent
            }
            let enclosedReplyBlaster = function(xReplyTo) {
                return function(i, gnode) {
                    replyBlaster(i, gnode, xReplyTo)
                }
            }(replyTo)
            let replyCompare = (a, b) => {
                return a.jsDate > b.jsDate ? 1 : -1 //oldest first on these.
            }

            xbinaryInsert(replyParent.replies, gnode, replyCompare, enclosedReplyBlaster)
        }
    }
}

function addNoTsGnode(gnode) {
    if (!noTsGnodes[gnode.ProfileId]) {
        noTsGnodes[gnode.ProfileId] = []
    }
    noTsGnodes[gnode.ProfileId].push(gnode)
}
function fixMissingTsItemsRelatedTo(profileId, foundTs) {
    if (!noTsGnodes[profileId]) { return }
    let jsDate = new Date(foundTs)
    let timelineEl = document.getElementById("tlcontainer")
    for (let i = 0; i < noTsGnodes[profileId].length; i++) {
        let gnode = noTsGnodes[profileId][i]

        //we need to:
        try {

            if (gnode.includeInMainTl) {
                //  remove it from the dom
                timelineEl.removeChild(gnode.domElements.container)
                //  remove it from the ordered array
                orderedTimelineElements.splice(orderedTimelineElements.indexOf(gnode), 1)
            } else {
                console.log("unsure at this time how to remove and reinsert from non maintl stuff.")
                continue

                // wait i'm concerned with replies in the code below but i dont think it really applies. because replies will be timestamped already durr
                // i thought the code below would work, but still getting errors. i think retractions are causing it.
                // if there actually are any nested things that arent sorting right due to lack of ts then some code like below might help locate.
                // let replyParent = gnReplyParents[gnode.Cid]
                // let replyContainer = replyParent.domElements.replyContainer //if we're in here the gnReplyParent, either real target or a temp dummy one, must already exist.
                // if (replyContainer.contains(gnode.domElements.container)) {
                //     // I'm not sure this is working.
                //     replyContainer.removeChild(gnode.domElements.container)
                //     replyParent.replies.splice(replyParent.replies.indexOf(gnode), 1)
                //     console.log("YAY?")
                // }
            }



        } catch(e) {
            console.log("fixMissingTsItemsRelatedTo error", e)
        }
        //  fix the ts (set .jsDate and .Date)
        gnode.Date = foundTs
        gnode.jsDate = jsDate
        //  jam it back in
        //  now, i would LIKE to update the text that is displayed in the date lines for the rows we just jammed back in but we dont have a reference for just that bit.
        //  would like to be able to write the below, but not everything is putting the tsTextnode yet ... wait a gnode should only need taht done once for it. and dont need to be done how it is.
        gnode.domElements.tsTextnode.textContent = cheesyDate(gnode.jsDate) + " "
        // and to keep a reference i'd have to rework a few things like all the spots where i currently just stick it into the text
        performDomInsertion(gnode)
    }
    // remove the stuff for this profile id from the noTsGnodes list since they all should have something now.
    delete noTsGnodes[profileId]
}

// function checkIfRetracted(gnode) {
//     if (retractedCids[gnode.Cid] && retractedCids[gnode.Cid][gnode.ProfileId]) {
//         return true
//     }
//     if (retractedCids[gnode.repoost] && retractedCids[gnode.Cid][gnode.ProfileId]) {
//         return true
//     }
//     return false
// }

function createReplyContainerDiv() {
    let divEl = document.createElement("div")
    divEl.style.marginLeft = "20px"
    return divEl
}

function prepareDomElements(gnode) {
    // let entryContainer = document.createElement("div")
    let entryContainer = tlEntryTemplate.cloneNode(true)
    entryContainer.title = makeGnodeTitle(gnode)

    let gnodeDomElements = {
        container: entryContainer,
        tsTextnode: document.createTextNode(cheesyDate(gnode.jsDate) + " ")
    }
    let bigicon = entryContainer.querySelector(".bigicon")
    bigicon.setAttribute("data-jdenticon-value", gnode.ProfileId)
    jdenticon.update(bigicon)

    gnode.domElements = gnodeDomElements
    addPostPTag(gnode, gnodeDomElements)
    addRePostPTag(gnode, gnodeDomElements)
    addFollowsTag(gnode, gnodeDomElements)

    // swap ourself in for the dummy entry if there is a dummy entry.
    let replyParent = gnReplyParents[gnode.Cid]
    if (replyParent && replyParent.dummyParent) {
        gnode.replies = replyParent.replies
        gnode.domElements.replyContainer = replyParent.domElements.replyContainer
    } else {
        gnode.domElements.replyContainer = createReplyContainerDiv()
    }
    //replace any dummy-reply-holder with ourself now.
    gnReplyParents[gnode.Cid] = gnode
    entryContainer.id = "entry" + Object.keys(gnReplyParents).length
    let replyRow = entryContainer.querySelector(".replyrow")
    replyRow.appendChild(gnode.domElements.replyContainer)
}

function replyBlaster(i, gnode, replyTo) {
    console.log(`replyBlaster: insert reply ${gnode.Cid} at ${i} of ${replyTo} replies.`)
    // actually insert these reply info into div which should hold them. it might be a dummy that isnt on screen yet. thats ok.
    let replyContainer = gnReplyParents[replyTo].domElements.replyContainer //if we're in here the gnReplyParent, either real target or a temp dummy one, must already exist.
    let existingChildren = replyContainer.childNodes
    let nodeToInsert = gnode.domElements.container
    if (i == replyContainer.childNodes.length) {
        console.log(`replyBlaster append at end`)
        replyContainer.appendChild(nodeToInsert);
    } else {
        //new one becomes the new element i of the children ... meaning add it before existing element i
        console.log(`replyBlaster become elem ${i}`)
        let siblingOfNew = existingChildren[i]
        let siblingParent = siblingOfNew.parentNode
        siblingParent.insertBefore(nodeToInsert, siblingOfNew);
    }
    setTimeout(function(xnodeToInsert) { return function() {
        xnodeToInsert.classList.remove("collapsed")
        xnodeToInsert.classList.add("expanded")
    }}(nodeToInsert), 100)

}

function domBlaster(i, gnode) {
    console.log("blast ...", gnode)
    console.log(`blast ${gnode.PreviewText} at ${i}`)
    // return

    // let timelineEl = document.getElementById("timeline")
    let nodeToInsert = gnode.domElements.container

    let timelineEl = document.getElementById("tlcontainer")
    // let tlEntryTemplate = document.getElementById("telentry_template").querySelector("div")
    // let nodeToInsert = tlEntryTemplate.cloneNode(true)

    let existingChildren = timelineEl.childNodes
    if (i == timelineEl.childNodes.length) {
        timelineEl.appendChild(nodeToInsert);
    } else {
        //new one becomes the new element i of the children ... meaning add it before existing element i
        console.log(`blast into list and become elem ${i}`)
        let siblingOfNew = existingChildren[i]
        if (!siblingOfNew) {
            //debuggin since this shouldnt happen lol.
            console.log("NO SIBLING??")
        }
        let siblingParent = siblingOfNew.parentNode
        siblingParent.insertBefore(nodeToInsert, siblingOfNew);
    }
    //wasnt seeing the transition by just adding the class here. seems to work with a little timeout. dunno why this is a thing.
    // let wrapped =
    setTimeout(function(xnodeToInsert) { return function() {
        xnodeToInsert.classList.remove("collapsed")
        xnodeToInsert.classList.add("expanded")
    }}(nodeToInsert), 100)

}

function makeGnodeTitle(gnode) {
    let title = "ProfileId: " + gnode["ProfileId"] + "\nGraphNode cid: " + gnode["Cid"] + "\nGraphNode previous: " + gnode["previous"]
    if (gnode["post"] != undefined) {
        if (gnode["post"]["Reply"] != undefined) {
            for (var j = 0; j < gnode["post"]["Reply"].length; j++) {
                title += "\nReply to GraphNode cid: " + gnode["post"]["Reply"][j]
            }
        }
        title += "\nPost Content Cid: " + gnode["post"]["Cid"]
    }
    if (gnode["publicfollow"] != undefined) {
        gnode.followeeNameMissing = true
        for (var j = 0; j < gnode["publicfollow"].length; j++) {
            title += "\nFollow of ProfileId: " + gnode["publicfollow"][j]
        }
    }
    // console.log(gnode)
    // console.log(gnode.jsDate)
    // title += `\nDate: ${gnode.jsDate.toISOString().split('.')[0]+"Z"}`
    return title
}

function addFollowsTag(gnode, gnodeDomElements) {
    if (gnode.ProfileId != selectedIdentityProfileId) {
        return
    }

    let dispName = profileNametag(gnode.profile)
    if (gnode["publicfollow"]) {
        gnodeDomElements["follows"] = {}

        let followsDiv = document.createElement("div")
        for (var j = 0; j < gnode["publicfollow"].length; j++) {
            let followedProfileId = gnode["publicfollow"][j]
            // let followText = cheesyDate(gnode.jsDate) + " " + dispName + ": Follow of " + followedProfileId
            // continue

            // let followText = dispName + ": Follow of " + followedProfileId
            let followText = `${dispName} - Follow of ${followedProfileId}`
            let textnode = document.createTextNode(followText);



            let ptag = document.createElement("p");
            ptag.style.margin = "0px"
            // ptag.appendChild(gnodeDomElements.tsTextnode)
            ptag.appendChild(textnode);
            followsDiv.appendChild(ptag)
            gnodeDomElements["follows"][followedProfileId] = ptag
        }
        gnodeDomElements["followsDiv"] = followsDiv
        // gnodeDomElements.container.appendChild(followsDiv)

        let stdPostContentDiv = gnodeDomElements.container.querySelector(".stdpostcontent")
        stdPostContentDiv.appendChild(followsDiv)

    }
}

function addPostPTag(gnode, gnodeDomElements) {
    if (!gnode["post"] && !gnode["repost"]) {
        return null
    }
    // var ptag = document.createElement("p");
    // ptag.appendChild(gnodeDomElements.tsTextnode);

    let postPreviewTextnode = document.createTextNode(getNodePreviewText(gnode));
    // if (gnode.post) {
    //     // postPreviewTextnode = document.createTextNode(getNodePreviewText(gnode));
    //     postPreviewTextnode = document.createTextNode(getNodePreviewText(gnode));
    // } else {
    //     //a repost without a post attached needs a bit of help to be displayed in the expected way
    //     postPreviewTextnode = document.createTextNode(getNoPostPreviewText(gnode));
    // }

    let posterInfoTextnode = document.createTextNode(getNodePosterInfoText(gnode));

    // gnodeDomElements.postPtag = ptag
    gnodeDomElements.posterInfoTextnode = posterInfoTextnode
    gnodeDomElements.postTextNode = postPreviewTextnode
    let buttonArea = gnodeDomElements.container.querySelector(".buttonarea")
    // buttonArea = document.createElement("div");
    // <!-- follow: &#x1f465; reply: &#x1f5e8; repost: &#x1f504; unfollow: &#x274c; retract: &#x1f5d1; -->


    gnodeDomElements.replyButton = makeATag("&#x1f5e8;", function (cid) {
        return function () {
            document.getElementById("inreplyto").value = cid
            focusPostText()
            return false;
        }
    }(gnode.Cid), true)
    // stupidshit = gnodeDomElements.replyButton
    buttonArea.appendChild(gnodeDomElements.replyButton);
    // ptag.appendChild(document.createTextNode(" "))

    let rpCid = gnode.repost ? gnode.repost : gnode.Cid
    gnodeDomElements.repostButton = makeATag("&#x1f504;", function (cid) {
        return function () {
            document.getElementById("repostofnodecid").value = cid
            focusPostText()
            return false;
        }
    }(rpCid), true)
    // ptag.appendChild(gnodeDomElements.repostButton);
    // ptag.appendChild(document.createTextNode(" "))
    buttonArea.appendChild(gnodeDomElements.repostButton);

    if (gnode.ProfileId == selectedIdentityProfileId) {
        //offer a disavowal/retraction (but its not a delete, because that is nonsensical in terms of a blockchain.) for things we posted
        gnodeDomElements.retractButton = makeATag("&#x1f5d1;", function (cid) {
            return function () {
                retract(cid)
                focusPostText()
                return false;
            }
        }(gnode.Cid), true)
        // ptag.appendChild(gnodeDomElements.retractButton);
        // ptag.appendChild(document.createTextNode(" "))
        buttonArea.appendChild(gnodeDomElements.retractButton);
    } else {
    // if (gnode.ProfileId != selectedIdentityProfileId) {
        gnodeDomElements.unfollowButton = makeATag("&#x2718;", function (profileId) {
            return function () {
                unfollow(profileId)
                focusPostText()
                return false;
            }
        }(gnode.ProfileId), true)
        // ptag.appendChild(gnodeDomElements.unfollowButton);
        // ptag.appendChild(document.createTextNode(" "))
    }

    // ptag.appendChild(postPreviewTextnode);

    if (gnode.post) {

        let stdPostInfoDiv = gnodeDomElements.container.querySelector(".stdpostinfo")
        stdPostInfoDiv.appendChild(posterInfoTextnode)
        stdPostInfoDiv.appendChild(document.createTextNode(" - "))
        stdPostInfoDiv.appendChild(gnodeDomElements.tsTextnode)
        if (gnodeDomElements.unfollowButton) {
            stdPostInfoDiv.appendChild(gnodeDomElements.unfollowButton)
        }

        let stdPostContentDiv = gnodeDomElements.container.querySelector(".stdpostcontent")
        stdPostContentDiv.appendChild(postPreviewTextnode)
    }

    // gnodeDomElements.container.appendChild(ptag)
}

function addRePostPTag(gnode, gnodeDomElements) {
    if (!gnode["repost"]) {
        return null
    }
    // var ptag = document.createElement("p");
    let previewTextnode = document.createTextNode(getRepostPreviewText(gnode))
    let labelTextnode = document.createTextNode("[REPOST OF] ");

    // ptag.appendChild(textnode);
    // let repostContainer = document.createElement("div")
    // addFollowButton(ptag, node["RepostOf"]["ProfileId"])
    //
    // let followButton = makeATag("F", function(profileId){ return function(){
    //     follow(profileId)
    //     focusPostText()
    //     return false;
    // }}(gnode.reposteeProfile.Id))

    if (!gnode["post"]) {
        let repostNoteDiv = gnodeDomElements.container.querySelector(".repostnotespan")
        repostNoteDiv.style.removeProperty("height")

        let reposterSmallIcon =  repostNoteDiv.querySelector(".smallicon")
        reposterSmallIcon.setAttribute("data-jdenticon-value", gnode.ProfileId)
        reposterSmallIcon.style.display = ""
        jdenticon.update(reposterSmallIcon)
        let reposterInfoP = gnodeDomElements.container.querySelector(".reposterinfo")
        // reposterInfoP.
        // let reposterSmallIcon = document.createElement("svg")
        // reposterSmallIcon.style.width = "20px"
        // reposterSmallIcon.style.height = "20px"
        // repostNoteDiv.appendChild(reposterSmallIcon)

        reposterInfoP.appendChild(gnodeDomElements.posterInfoTextnode)
        let reposterTsP = gnodeDomElements.container.querySelector(".reposterts")

        reposterTsP.appendChild(document.createTextNode(" reposted - "))
        reposterTsP.appendChild(gnodeDomElements.tsTextnode)
        if (gnodeDomElements.unfollowButton) {
            reposterTsP.appendChild(gnodeDomElements.unfollowButton)
        }
    }

    let followButtonPlaceholder = makeATag("&#x1f465;", function(){
        return false
    }, true)
    gnodeDomElements.repostFollowButton = followButtonPlaceholder
    gnodeDomElements.repostTextNode = previewTextnode
    gnodeDomElements.reposteeInfoTextNode = document.createTextNode(getReposteeInfoText(gnode));
    gnodeDomElements.reposteeInfoTs = document.createTextNode(getReposteeTsText(gnode))

    let rePostContentDiv = gnodeDomElements.container.querySelector(".repostcontainer")
    let reposteeInfoP = rePostContentDiv.querySelector(".reposteeinfo")
    reposteeInfoP.appendChild(gnodeDomElements.reposteeInfoTextNode)
    // rePostContentDiv.querySelector(".reposteeinfo").appendChild(document.createTextNode("WTFFFFFFFF"))
    reposteeInfoP.appendChild(gnodeDomElements.repostFollowButton)

    let reposteeTsP = rePostContentDiv.querySelector(".reposteets")
    reposteeTsP.appendChild(gnodeDomElements.reposteeInfoTs)

    // let TEMPofuck =
    rePostContentDiv.querySelector(".repostpreview").appendChild(gnodeDomElements.repostTextNode)
    rePostContentDiv.style.display = ""

    let smallicon = rePostContentDiv.querySelector(".smallicon")
    smallicon.classList.add("collapsed")
    // jdenticon.update(smallicon)

    // let appendee
    // if (gnode["post"]) {
    //     appendee = gnodeDomElements.postPtag
    // } else {
    //     //a repost without a post attached needs a bit of help to be displayed in the expected way
    //     appendee = document.createElement("p");
    //     let dispName = (gnode.profile && gnode.profile.DisplayName) ? gnode.profile.DisplayName : "[NODATA]"
    //     appendee.appendChild(document.createTextNode(cheesyDate(gnode.jsDate) + " " + dispName + ": "))
    //     gnodeDomElements.container.appendChild(appendee)
    // }
    // if (!gnodeDomElements.postPtag) {
    //     //a repost without a post attached needs a bit of help to be displayed in the expected way
    //     let dispName = (gnode.profile && gnode.profile.DisplayName) ? gnode.profile.DisplayName : "[NODATA]"
    //     let postPtag = document.createElement("p");
    //     postPtag.appendChild(document.createTextNode(cheesyDate(gnode.jsDate) + " " + dispName + ": "))
    //     gnodeDomElements.postPtag = postPtag
    //     gnodeDomElements.container.appendChild(postPtag)
    // }


    // gnodeDomElements.postPtag.appendChild(labelTextnode);
    // gnodeDomElements.postPtag.appendChild(followButtonPlaceholder);
    // gnodeDomElements.postPtag.appendChild(previewTextnode);

    //     //go in with existing ptag
    //     gnodeDomElements.postPtag.appendChild(followButtonPlaceholder)
    //     gnodeDomElements.postPtag.appendChild(previewTextnode)
    // } else {
    //     //have to make a ptag.
    //     let ptag = document.createElement("p");
    //     ptag.appendChild(followButtonPlaceholder);
    //     ptag.appendChild(previewTextnode);
    // }
}

function updateTimelinePost(gnode) {
    if (!gnode.post || !gnode.domElements || !gnode.domElements.postTextNode || !gnode.domElements.posterInfoTextnode) {
        return
    }
    console.log("updateTimelinePost: here1")
    gnode.domElements.postTextNode.textContent = getNodePreviewText(gnode)
    gnode.domElements.posterInfoTextnode.textContent = getNodePosterInfoText(gnode)
}
function updateTimelineRepost(gnode) {
    // if (!gnode.domElements || !gnode.domElements.repostTextNode) {
    if (!gnode.domElements || !gnode.domElements.repostTextNode || !gnode.reposteeProfile) {
        return
    }
    // return
    console.log("updateTimelineRepost: here1")
    gnode.domElements.repostTextNode.textContent = getRepostPreviewText(gnode)
    gnode.domElements.reposteeInfoTextNode.textContent = getReposteeInfoText(gnode)
    gnode.domElements.reposteeInfoTs.textContent = getReposteeTsText(gnode)


    let rePostContentDiv = gnode.domElements.container.querySelector(".repostcontainer")
    let smallicon = rePostContentDiv.querySelector(".smallicon")

    if (!gnode.post) {
        let bigicon = gnode.domElements.container.querySelector(".bigicon")
        bigicon.setAttribute("data-jdenticon-value", gnode.reposteeProfile.Id)
        jdenticon.update(bigicon)
        smallicon.style.display = "none"
    } else {
        smallicon.setAttribute("data-jdenticon-value", gnode.reposteeProfile.Id)
        jdenticon.update(smallicon)
        smallicon.style.display = ""
    }


    if (gnode.reposteeProfile.Id == selectedIdentityProfileId || follows[gnode.reposteeProfile.Id]) {
        //if this is us or one of our followers reposting our own thing, we dont need a follow button.
        //or a repost of someone we already follow, dont need it either.
        gnode.domElements.repostFollowButton.style = "display: none"
    } else {
        gnode.domElements.repostFollowButton.onclick = function(profileId){ return function(){
            follow(profileId)
            focusPostText()
            return false;
        }}(gnode.reposteeProfile.Id)
        //track the follow button in case we need to suppress it later.
        if (!followButtons[gnode.reposteeProfile.Id]) {
            followButtons[gnode.reposteeProfile.Id] = []
        }
        followButtons[gnode.reposteeProfile.Id].push(gnode.domElements.repostFollowButton)
    }
}

function updateTlFolloweeInfo(gnode) {
    if (!gnode.followeeProfileInfo || !gnode.domElements.follows) {
        return
    }
    console.log("updateTlFolloweeInfo ...")

    let dispName = (gnode.profile && gnode.profile.DisplayName) ? profileNametag(gnode.profile) : "[NODATA]"
    for (let followeeProfileCid of Object.keys(gnode.followeeProfileInfo)) {
        let pTagtoUpdate = gnode.domElements.follows[followeeProfileCid]
        let textNode = pTagtoUpdate.childNodes[0] //0 = the ts textnode, 1 = the follow display textnode
        let follweeProfile = gnode.followeeProfileInfo[followeeProfileCid]
        let followeeDispName = (follweeProfile.Id && follweeProfile.DisplayName) ? profileNametag(follweeProfile) : "[UNOBTAINABLE]"
        textNode.textContent = `${dispName} - Follow of ${followeeDispName}`
    }

}
// function updateTlFolloweeInfo(gnode) {
//     console.log("updateTlFolloweeInfo ...")
//     let dispName = (gnode.profile && gnode.profile.DisplayName) ? gnode.profile.DisplayName : "[NODATA]"
//     for (let followeeProfileCid of Object.keys(gnode.followeeProfileInfo)) {
//         let pTagtoUpdate = gnode.domElements.follows[followeeProfileCid]
//         let textNode = pTagtoUpdate.childNodes[0]
//         let followeeDispName = gnode.followeeProfileInfo[followeeProfileCid].DisplayName
//         textNode.textContent = cheesyDate(gnode.jsDate) + " " + dispName + ": Follow of " + followeeDispName
//     }
// }
function getRepostPreviewText(gnode) {
    // let indent = gnode["Indent"] ? gnode["Indent"] : 0
    // // let dispName = (gnode.profile && gnode.profile.DisplayName) ? gnode.profile.DisplayName : "[NODATA]"
    // let dispName = gnode.reposteeProfile ? gnode.reposteeProfile.DisplayName :  "[NAME-TBD]"
    // let ts = ""
    // if (gnode.repostGn) {
    //     ts = cheesyDate(new Date(gnode.repostGn.post.Date)) + " "
    // }

    return gnode["RepostPreviewText"] ? gnode["RepostPreviewText"] : gnode["repost"]
    // return " " + ts + dispName + ": " + previewText + "  "
}
function getReposteeInfoText(gnode) {
    return gnode.reposteeProfile ? profileNametag(gnode.reposteeProfile) :  "[NAME-TBD]"
}
function getReposteeTsText(gnode) {
    let ts = ""
    if (gnode.repostGn) {
        ts = cheesyDate(new Date(gnode.repostGn.post.Date)) + " "
    }
    return ` - ${ts}`
}

function getNodePreviewText(gnode) {
    // let indent = gnode["Indent"] ? gnode["Indent"] : 0
    // let dispName = (gnode.profile && gnode.profile.DisplayName) ? gnode.profile.DisplayName : "[NODATA]"
    return gnode["PreviewText"] ? gnode["PreviewText"] : gnode["Cid"]
    // return " " + "\u00A0".repeat(indent * 8) + " " + dispName + ": " + previewText + "  "
}
function getNodePosterInfoText(gnode) {
    if (gnode.profile && gnode.profile.DisplayName) {
        return profileNametag(gnode.profile)
    }
    return "[NODATA]"
}
function profileNametag(profileData) {
    let ProfileId = profileData.Id
    let shortinfo = ProfileId.substring(ProfileId.length - 5)
    return `@${profileData.DisplayName} (${shortinfo})`
}

function getNoPostPreviewText(gnode) {
    let dispName = (gnode.profile && gnode.profile.DisplayName) ? gnode.profile.DisplayName : "[NODATA]"
    return " " + dispName + ": "
}

//stolen/hacked from https://github.com/bhowell2/binary-insert-js/blob/master/index.ts
//i want to be able to do more than just put it in the array.
function xbinaryInsert(array, insertValue, comparator, domBlaster) {
    /*
    * These two conditional statements are not required, but will avoid the
    * while loop below, potentially speeding up the insert by a decent amount.
    * */
    if (array.length === 0 || comparator(array[0], insertValue) >= 0) {
        array.splice(0, 0, insertValue)
        // console.log("typ1", array)
        domBlaster(0, insertValue)
        return array;
    } else if (array.length > 0 && comparator(array[array.length - 1], insertValue) <= 0) {
        let splicePos = array.length
        array.splice(array.length, 0, insertValue);
        // console.log("typ2", splicePos, array)
        // throw new Error("fuck")
        domBlaster(splicePos, insertValue)
        return array;
    }
    let left = 0, right = array.length;
    let leftLast = 0, rightLast = right;
    while (left < right) {
        const inPos = Math.floor((right + left) / 2)
        const compared = comparator(array[inPos], insertValue);
        if (compared < 0) {
            left = inPos;
        } else if (compared > 0) {
            right = inPos;
        } else {
            right = inPos;
            left = inPos;
        }
        // nothing has changed, must have found limits. insert between.
        if (leftLast === left && rightLast === right) {
            break;
        }
        leftLast = left;
        rightLast = right;
    }
    // use right, because Math.floor is used
    array.splice(right, 0, insertValue);
    // console.log("typ3", array)
    domBlaster(right, insertValue)
    return array
}

function displayTimelineTexts(orderedHistory) {
    let target = document.getElementById("timeline")
    // let selectedIdentityProfileId = ""
    // if (selectedIdentity) {
    //     selectedIdentityProfileId = identities[selectedIdentity]["profileid"]
    // }
    target.textContent = "" //apparently not the worst way to make all the existing child elements go away before we render the updated history.
    for (var i = 0; i < orderedHistory.length; i++) {
        console.log("adding this", orderedHistory[i])
        const node = orderedHistory[i]
        // throw new Error("halp me i cannot do it")
        var ptag = document.createElement("p");
        ptag.title = "ProfileId: " + node["ProfileId"] + "\nGraphNode cid: " + node["Cid"] + "\nGraphNode previous: " + node["previous"]
        if (node["post"] && node["post"]["Reply"]) {
            for (var j = 0; j < node["post"]["Reply"].length; j++) {
                ptag.title += "\nReply to GraphNode cid: " + node["post"]["Reply"][j]
            }
            ptag.title += "\nPost Content Cid: " + node["post"]["Cid"]
        }
        let showButtons = true
        if (node["publicfollow"]) {
            showButtons = false
            for (var j = 0; j < node["publicfollow"].length; j++) {
                ptag.title += "\nFollow of ProfileId: " + node["publicfollow"][j]
            }
        }
        // // var textnode = document.createTextNode(texts[i]);
        text = node["Date"] + " " + "\u00A0".repeat(node["Indent"] * 8) + " " + node.profile["DisplayName"] + ": " + node["contents"] + "  "
        // text = node["Date"] + " " + "\u00A0".repeat(node["Indent"] * 8) + " " + node["DisplayName"] + ": " + node["PreviewText"] + "  "
        const textnode = document.createTextNode(text);
        ptag.appendChild(textnode);
        //
        // if (showButtons) {
        //     if (node["ProfileId"] != selectedIdentityProfileId && node["RepostOf"]) {
        //         //TODO also dont show a follow button on someone we already follow.
        //         addFollowButton(ptag, node["RepostOf"]["ProfileId"])
        //     }
        //
        //     // addfollowButton(ptag, node["ProfileId"]) // only on reposteee that isnt on my follow list -- so, todo.
        //     if (node["ProfileId"] == selectedIdentityProfileId && !node["Retracted"]) {
        //         addRetractButton(ptag, node["Cid"])
        //     } else {
        //         console.log("no retracto b/c != ...", node["ProfileId"], "and", selectedIdentityProfileId)
        //     }
        //     addUnfollowButton(ptag, node["ProfileId"])
        //
        //     if (!node["Retracted"]) {
        //         addReplyButton(ptag, node["Cid"])
        //
        //         addRepostButton(ptag, node)
        //         // addLikeButton(ptag, node["Cid"])
        //         // addUnlikeButton(ptag, node["Cid"])
        //     }
        // }
        //
        target.appendChild(ptag);
    }
}

function displayTimelineTextsFromServer(textsJson) {
    let texts = JSON.parse(textsJson)
    let target = document.getElementById("timeline")
    // let selectedIdentityProfileId = ""
    // if (selectedIdentity) {
    //     selectedIdentityProfileId = identities[selectedIdentity]["profileid"]
    // }
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
                // addLikeButton(ptag, node["Cid"])
                // addUnlikeButton(ptag, node["Cid"])
            }
        }

        target.appendChild(ptag);
    }
}

function makeATag(text, onclick, nobrackets) {
    var atag = document.createElement("a");
    atag.href = "#"
    atag.onclick = onclick
    if (nobrackets) {
        atag.innerHTML = text
    } else {
        atag.innerHTML = "[" + text +  "]"
    }
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

function menuswap() {
    let menuHidden = document.getElementById("menuthing").style.display == "none" ? true : false
    if (menuHidden) {
        // document.getElementById("mainthing").style.display="none"
        document.getElementById("mainuipane").style.display="none"
        document.getElementById("menuthing").style.display=""
    } else {
        document.getElementById("menuthing").style.display="none"
        // document.getElementById("mainthing").style.display=""
        document.getElementById("mainuipane").style.display=""
    }
}

function toggle(thing) {
    thing = document.getElementById(`entry${thing}`)
    if (thing.classList.contains("expanded")) {
        thing.classList.remove("expanded")
    } else {
        thing.classList.add("expanded")
    }
}

myOnload = async function() {
    // console.log("DEBUGGGGGGGG do naaathin")
    // return
    tlEntryTemplate = document.getElementById("telentry_template").querySelector("div")

    await startIpfs()
    await reloadSession()
    setEnterButtonAction()
    focusPostText()
}

window.addEventListener('DOMContentLoaded', myOnload, false);