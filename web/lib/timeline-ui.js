
function hideFollowButtonsForProfileId(followProfileId) {
    if (!followButtons[followProfileId] || followButtons[followProfileId].length == 0) {
        return
    }
    for (let i = 0; i < followButtons[followProfileId].length; i++) {
        followButtons[followProfileId][i].style = "display: none"
    }
}

async function pullDmOut(gnode) {
    if (!gnode.Dm || gnode.Dm.length != 3) {
        return
    }
    // if the gnode profile is OUR profile, then this node includes a DM we sent to someone. the 2nd element of the DM array will provide the info we need to put content into dms.

    // return

    let encryptedAccessBundle
    let encryptedRecipProfileId = null
    if (gnode.ProfileId == selectedIdentityProfileId) {
        encryptedAccessBundle = gnode.Dm[1]
        encryptedRecipProfileId = gnode.Dm[2]
    } else {
        encryptedAccessBundle = gnode.Dm[0]
    }
    try {
        let accessBundle = await decryptMessage(base64StringToArrayBuffer(encryptedAccessBundle))
        if (accessBundle[0] === "{") {
            pullDmV2(accessBundle, gnode.ProfileId, encryptedRecipProfileId)
        } else {
            pullDmV1(accessBundle, gnode.ProfileId, encryptedRecipProfileId)
        }
    } catch (e) {
        console.log(`error processing dm: ${e.message}`)
    }
}
async function pullDmV2(accessBundle, senderProfileId, encryptedRecipProfileId) {
    if (!accessBundle) {
        console.log("pullDmV2 saw dm that we could not decrypt the info of -- presumably not for us!")
        return
    }
    let interacteeProfileId
    let toInteractee = false
    let accessBundleDecoded = JSON.parse(accessBundle)
    let iv = base64StringToArrayBuffer(accessBundleDecoded.iv)
    let symKeyBytes = base64StringToArrayBuffer(accessBundleDecoded.k)
    const symKey = await window.crypto.subtle.importKey(
        'raw',
        symKeyBytes,
        {
            name: 'AES-GCM',
            length: 256,
        },
        true,
        ['encrypt', 'decrypt'],
    )

    let td = new TextDecoder()
    if (senderProfileId == selectedIdentityProfileId) {
        console.log("try to pull out dm v2 we sent")
        let interacteeProfileIdBytes = await decryptPayload(base64StringToArrayBuffer(encryptedRecipProfileId), iv, symKey)
        interacteeProfileId = td.decode(interacteeProfileIdBytes)
        toInteractee = true
    } else {
        console.log("try to pull out dm v2 we received")
        interacteeProfileId = senderProfileId
    }

    let decryptedPost
    // the post here is encrypted using the aes symmetrical key from the access bundle.
    try {
        let encryptedPostJsonBytes = await getCidContentsByGet(accessBundleDecoded.cid, true)
        let decryptedPostJsonBytes = await decryptPayload(encryptedPostJsonBytes, iv, symKey)
        let decryptedPostJson = td.decode(decryptedPostJsonBytes)
        decryptedPost = JSON.parse(decryptedPostJson)
        decryptedPost.jsDate = new Date(decryptedPost.Date)

        let encryptedPostContentBytes = await getCidContentsByGet(decryptedPost.Cid, true)
        let decryptedPostPreviewTextBytes = await decryptPayload(encryptedPostContentBytes, iv, symKey)
        decryptedPost.PreviewText = td.decode(decryptedPostPreviewTextBytes)
    } catch(e) {
        decryptedPost.jsDate = new Date()
        decryptedPost.PreviewText = `[ msg load error: ${e.message} ]`
        console.log("pullDmV2 somehow we could get the dmPostCid but we couldnt decrypt to json the blob we found there ... *shrug*.")
        return
    }
    if (toInteractee) {
        decryptedPost.To = true
    } else {
        decryptedPost.From = true
    }
    insertDmIntoOrderedArray(interacteeProfileId, decryptedPost)
}

async function pullDmV1(dmPostCid, senderProfileId, encryptedRecipProfileId) {
    if (!dmPostCid) {
        console.log("pullDmV1 saw dm that we could not decrypt the info of -- presumably not for us!")
        return
    }

    let interacteeProfileId
    let toInteractee = false

    if (senderProfileId == selectedIdentityProfileId) {
        console.log("try to pull out dm v1 we sent")
        interacteeProfileId = await decryptMessage(base64StringToArrayBuffer(encryptedRecipProfileId))
        toInteractee = true
    } else {
        console.log("try to pull out dm v1 we received")
        interacteeProfileId = senderProfileId
    }

    // dmPostCid = await decryptMessage( base64StringToArrayBuffer(encryptedDmPostCid) )

    let decryptedPost
    try {
        let encryptedPostJson = await getCidContentsByGet(dmPostCid, true)
        let decryptedPostJson = await decryptMessage(encryptedPostJson)
        decryptedPost = JSON.parse(decryptedPostJson)
        decryptedPost.jsDate = new Date(decryptedPost.Date)
        let encryptedPostContent = await getCidContentsByGet(decryptedPost.Cid, true)
        decryptedPost.PreviewText = await decryptMessage(encryptedPostContent)
    } catch(e) {
        decryptedPost.jsDate = new Date()
        decryptedPost.PreviewText = `[ msg load error: ${e.message} ]`
        console.log("pullDmOut somehow we could get the dmPostCid but we couldnt decrypt to json the blob we found there ... *shrug*.")
        return
    }
    if (toInteractee) {
        decryptedPost.To = true
    } else {
        decryptedPost.From = true
    }
    insertDmIntoOrderedArray(interacteeProfileId, decryptedPost)
}

function insertDmIntoOrderedArray(interacteeProfileId, decryptedPost) {
    if (!orderedDmPostsByInteracteeProfileId[interacteeProfileId]) {
        orderedDmPostsByInteracteeProfileId[interacteeProfileId] = []
    }
    let dateCompare = (a, b) => {
        return a.jsDate > b.jsDate ? -1 : 1
    }
    xbinaryInsert(orderedDmPostsByInteracteeProfileId[interacteeProfileId], decryptedPost, dateCompare, function(){})

}

function addGnToTimeline(gnode) {
    let foundTs = gnode.Date ? gnode.Date : (gnode.post ? gnode.post.Date : undefined)
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
        let removedFromDom = false
        //we need to:
        try {
            if (gnode.includeInMainTl) {
                //  remove it from the dom
                timelineEl.removeChild(gnode.domElements.container)
                //  remove it from the ordered array
                orderedTimelineElements.splice(orderedTimelineElements.indexOf(gnode), 1)
                removedFromDom = true
            }
        } catch(e) {
            console.log("fixMissingTsItemsRelatedTo error", e)
        }
        //  fix the ts (set .jsDate and .Date)
        gnode.Date = foundTs
        gnode.jsDate = jsDate

        if (!removedFromDom) {
            continue
        }
        //  jam it back in, if we popped it out while we fixed it up.
        //  now, i would LIKE to update the text that is displayed in the date lines for the rows we just jammed back in but we dont have a reference for just that bit.
        //  would like to be able to write the below, but not everything is putting the tsTextnode yet ... wait a gnode should only need taht done once for it. and dont need to be done how it is.
        gnode.domElements.tsTextnode.textContent = cheesyDate(gnode.jsDate) + " "
        // and to keep a reference i'd have to rework a few things like all the spots where i currently just stick it into the text
        performDomInsertion(gnode)
    }
    // remove the stuff for this profile id from the noTsGnodes list since they all should have something now.
    delete noTsGnodes[profileId]
}

function removeUnfolloweePosts(profileId) {

    if (!gnOfInterestByProfileId[profileId]) { return }

    let domEaseoutPopper = function(el, removeFrom) {
        el.classList.remove("expanded")
        el.classList.add("collapsed")
        setTimeout(function(){
            removeFrom.removeChild(el)
        }, 600) //the animation itself should take 500ms
    }
    let timelineEl = document.getElementById("tlcontainer")
    for (let k in gnOfInterestByProfileId[profileId]) {
        let gnode = gnOfInterestByProfileId[profileId][k]
        try {
            if (gnode.includeInMainTl) {
                //  remove it from the dom
                domEaseoutPopper(gnode.domElements.container, timelineEl)
                //  remove it from the ordered array
                orderedTimelineElements.splice(orderedTimelineElements.indexOf(gnode), 1)
            } else {
                console.log("unsure at this time how to remove and reinsert from non maintl stuff.")
                if (gnode.post && gnode.post.Reply && gnode.post.Reply.length > 0) {
                    for (let i = 0; i < gnode.post.Reply.length; i++) {
                        let replyTo = gnode.post.Reply[i]
                        let replyParent = gnReplyParents[replyTo]
                        let replyContainer = replyParent.domElements.replyContainer //if we're in here the gnReplyParent, either real target or a temp dummy one, must already exist.
                        if (!replyContainer.contains(gnode.domElements.container)) {
                            continue //but am i doing something wrong if i'm getting here???
                        }
                        domEaseoutPopper(gnode.domElements.container, replyContainer)
                        // replyContainer.removeChild(gnode.domElements.container)
                        replyParent.replies.splice(replyParent.replies.indexOf(gnode), 1)
                    }
                }
            }
        } catch(e) {
            console.log("removeUnfolloweePosts error", e)
        }
    }
    // remove the stuff for this profile id from the gnOfInterestByProfileId
    delete gnOfInterestByProfileId[profileId]
}

function createReplyContainerDiv() {
    let divEl = document.createElement("div")
    divEl.style.marginLeft = "20px"
    return divEl
}

function prepareDomElements(gnode) {
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
    if (replyParent) {
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
    replyRow.style.display = ""
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
    // console.log("blast ...", gnode)
    // console.log(`blast ${gnode.PreviewText} at ${i}`)
    let nodeToInsert = gnode.domElements.container
    let timelineEl = document.getElementById("tlcontainer")
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
    title += `\nDate: ${gnode.jsDate.toISOString().split('.')[0] + "Z"}`

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
            let followText = `${dispName} - Follow of ${followedProfileId}`
            let textnode = document.createTextNode(followText);

            let ptag = document.createElement("p");
            ptag.style.margin = "0px"

            ptag.appendChild(textnode);
            followsDiv.appendChild(ptag)
            gnodeDomElements["follows"][followedProfileId] = ptag
        }
        gnodeDomElements["followsDiv"] = followsDiv

        let stdPostContentDiv = gnodeDomElements.container.querySelector(".stdpostcontent")
        stdPostContentDiv.appendChild(followsDiv)

    }
}

function addPostPTag(gnode, gnodeDomElements) {
    if (!gnode["post"] && !gnode["repost"]) {
        return null
    }

    let postPreviewTextnode = document.createTextNode(getNodePreviewText(gnode));
    let posterInfoTextnode = document.createTextNode(getNodePosterInfoText(gnode));

    gnodeDomElements.posterInfoTextnode = posterInfoTextnode
    gnodeDomElements.postTextNode = postPreviewTextnode
    let buttonArea = gnodeDomElements.container.querySelector(".buttonarea")

    gnodeDomElements.replyButton = makeATag("&#x1f5e8;", function (cid) {
        return function () {
            document.getElementById("inreplyto").value = cid
            clearUnmatchedRepost()
            focusPostText()
            return false;
        }
    }(gnode.Cid), true)
    buttonArea.appendChild(gnodeDomElements.replyButton);

    let rpCid = gnode.repost ? gnode.repost : gnode.Cid
    gnodeDomElements.repostButton = makeATag("&#x1f504;", function (cid) {
        return function () {
            document.getElementById("repostofnodecid").value = cid
            clearUnmatchedReply()
            focusPostText()
            return false;
        }
    }(rpCid), true)
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
        buttonArea.appendChild(gnodeDomElements.retractButton);
    } else {
        gnodeDomElements.unfollowButton = makeATag("&#x2718;", function (profileId) {
            return function () {
                unfollow(profileId)
                focusPostText()
                return false;
            }
        }(gnode.ProfileId), true)
    }

    if (gnode.post) {
        let stdPostInfoDiv = gnodeDomElements.container.querySelector(".stdpostinfo")
        stdPostInfoDiv.appendChild(posterInfoTextnode)
        let tsSpan = getTsSpan(gnodeDomElements)
        stdPostInfoDiv.appendChild(tsSpan)
        if (gnodeDomElements.unfollowButton) {
            stdPostInfoDiv.appendChild(gnodeDomElements.unfollowButton)
        }

        let stdPostContentDiv = gnodeDomElements.container.querySelector(".stdpostcontent")
        stdPostContentDiv.appendChild(postPreviewTextnode)
    }
}

function getTsSpan(gnodeDomElements) {
    let tsSpan = document.createElement("span")
    tsSpan.classList.add("tsspan")
    tsSpan.appendChild(document.createTextNode(" - "))
    tsSpan.appendChild(gnodeDomElements.tsTextnode)
    return tsSpan
}
function addRePostPTag(gnode, gnodeDomElements) {
    if (!gnode["repost"]) {
        return null
    }
    let previewTextnode = document.createTextNode(getRepostPreviewText(gnode))

    if (!gnode["post"]) {
        let repostNoteDiv = gnodeDomElements.container.querySelector(".repostnotespan")
        repostNoteDiv.style.removeProperty("height")

        let reposterSmallIcon =  repostNoteDiv.querySelector(".smallicon")
        reposterSmallIcon.setAttribute("data-jdenticon-value", gnode.ProfileId)
        reposterSmallIcon.style.display = ""
        jdenticon.update(reposterSmallIcon)
        let reposterInfoP = gnodeDomElements.container.querySelector(".reposterinfo")

        reposterInfoP.appendChild(gnodeDomElements.posterInfoTextnode)
        let reposterTsP = gnodeDomElements.container.querySelector(".reposterts")

        reposterTsP.appendChild(document.createTextNode(" reposted"))
        reposterTsP.appendChild(getTsSpan(gnodeDomElements))
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
    reposteeInfoP.appendChild(gnodeDomElements.repostFollowButton)

    let reposteeTsP = rePostContentDiv.querySelector(".reposteets")
    reposteeTsP.appendChild(gnodeDomElements.reposteeInfoTs)

    rePostContentDiv.querySelector(".repostpreview").appendChild(gnodeDomElements.repostTextNode)
    rePostContentDiv.style.display = ""

    let smallicon = rePostContentDiv.querySelector(".smallicon")
    smallicon.classList.add("collapsed")
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
    if (!gnode.domElements || !gnode.domElements.repostTextNode || !gnode.reposteeProfile) {
        return
    }
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
function getRepostPreviewText(gnode) {
    return gnode["RepostPreviewText"] ? gnode["RepostPreviewText"] : gnode["repost"]
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
    return gnode["PreviewText"] ? gnode["PreviewText"] : gnode["Cid"]
}
function getNodePosterInfoText(gnode) {
    if (gnode.profile && gnode.profile.DisplayName) {
        return profileNametag(gnode.profile)
    }
    return "[NODATA]"
}
