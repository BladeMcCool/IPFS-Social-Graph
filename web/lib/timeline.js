let asyncPool
let multihistory = {}

// const binaryInsert = require('binary-insert').binaryInsert

async function loadJsTimeline() {
    console.log("deprecated, use the updateJsTimeline.")
    return

    // alert("...")
    asyncPool = require("tiny-async-pool")
    if (!ipfsStarted) {
        await startIpfs()
        ipfsStarted = true
    }
    let identity = identities[selectedIdentity]
    if (!identity) {
        alert("no identity selected")
        return
    }
    await cancelCurrentHistoryRequest() //in case there is a server one going, kill it.
    resetTextTimelineArea()
    // alert("identity is " + selectedIdentity)
    let profileData
    try {
        profileData = await fetchCheckProfile(identity["profileid"], identity["profiletip"], identity["pub"])
        // identities[selectedIdentity].profileData = profileData
        profilesOfInterest[identity["profileid"]] = profileData
        console.log("profileData", profileData, "identity", identity)
    } catch(e) {
        console.log("load history got error from fetchCheckProfile:", e)
        return
    }
    await fetchGraphNodeHistory(profileData, true, multihistory, false)
    // let followees = extractFollowsProfileCids(history)

    // await fillHistoryPreviews(history)
    // console.log(history)
    // console.log("experiment1 got " + history.length + " entries for profile id " + identity["profileid"])
    // for (i = 0; i < history.length; i++) {
    //     console.log("history", i, history[i])
    // }
    // console.log("followees", followees)

    // displayTimelineTexts(history)
}

async function updateJsTimeline() {
    //i want to find updates only.
    //so ... for every profileid i follow and my own one, go spider that like a normal timeline load, except stop when we hit data we already know.
    if (!ipfsStarted) {
        await startIpfs()
        ipfsStarted = true
    }
    if (!identity) {
        console.log("no identity selected")
        return
    }

    await cancelCurrentHistoryRequest() //in case there is a server one going, kill it.
    let profileData
    try {
        profileData = await fetchCheckProfile(identity["profileid"], identity["profiletip"], identity["pub"])
        profilesOfInterest[identity["profileid"]] = profileData
        // identities[selectedIdentity].profileData = profileData
        console.log("updateJsTimeline got profileData", profileData, "identity", identity)
    } catch(e) {
        console.log("updateJsTimeline got error from fetchCheckProfile:", e)
        return
    }
    //we can spider with normal method to find anything new we made and new followee history etc resulting from those actions by our profile.
    // let followbackUpdatesTracker = {}
    let alreadyFollows = {}
    Object.assign(alreadyFollows, follows)
    fetchGraphNodeHistory(profileData, true, multihistory, true).catch(e => console.log(`updateJsTimeline fetchGraphNodeHistory err while collecting for ${profileData.Id}: `, e))

    //but we arent going to end up going and redoing our followees under normal circumstances. so lets do those
    for (let followeeProfileId in alreadyFollows) {
        getFolloweeProfileInfo(followeeProfileId).then(followeeProfileInfo => {
            fetchGraphNodeHistory(followeeProfileInfo, false, multihistory, true).catch(e => console.log(`updateJsTimeline fetchGraphNodeHistory err while collecting for followee ${profileData.Id}: `, e))
        }).catch(e => console.log(`updateJsTimeline getFolloweeProfileInfo err while collecting for ${profileData.Id}: `, e))
    }
}

let secretSauceCounter = 0
let secretSauceThreshold = 7
function resetSecretSauce() {
    secretSauceCounter = 0
    superSecretModeEnabled = false
}
function incrementSauce() {
    secretSauceCounter++
    console.log("secretSauce ", secretSauceCounter)
    if (secretSauceCounter >= secretSauceThreshold) {
        superSecretModeEnabled = true
    }
}

function resetProfilesInfoArea() {
    document.getElementById("serverlist").textContent = ""
    document.getElementById("followees").textContent = ""
}

// let meIcons = []
let loadingProfilesInfo = false
async function obtainProfilesInfo() {
    if (loadingProfilesInfo) { return }
    loadingProfilesInfo = true
    // superSecretModeEnabled = true;
    let fedmembersprofilesList = []
    let followeesprofilesList = []
    let obtainmentServerPath = serviceBaseUrl + "/service/curatedProfiles"
    if (superSecretModeEnabled) {
        //secret as much as someone cares to not review the source code to find this.
        obtainmentServerPath = serviceBaseUrl + "/service/federationProfiles"
    }
    let result = await makeRequest("GET", obtainmentServerPath)
    let decodedResult = JSON.parse(result)

    let insertFuncGetter = function(xOutputEl) { return function(i, profileData) {
        let existingChildren = xOutputEl.childNodes
        if (i == xOutputEl.childNodes.length) {
            xOutputEl.appendChild(profileData.domElement);
        } else {
            //new one becomes the new element i of the children ... meaning add it before existing element i
            console.log(`blast into list and become elem ${i}`)
            let siblingOfNew = existingChildren[i]
            if (!siblingOfNew) {
                //debuggin since this shouldnt happen lol.
                console.log("NO SIBLING??")
            }
            let siblingParent = siblingOfNew.parentNode
            siblingParent.insertBefore(profileData.domElement, siblingOfNew);
        }
    }}
    let compareFunc = (a, b) => {
        return a.DisplayName.toLowerCase() > b.DisplayName.toLowerCase() ? 1 : -1
    }

    let followeeInsertFunc = insertFuncGetter(document.getElementById("followees"))
    for (let profileId of Object.keys(follows)) {
        if (profileId == selectedIdentityProfileId) { continue } // this shouldnt actually happen, i just dont really want to see it if it does.
        let profileData = followeeProfiles[profileId]
        if (!profileData) {
            console.log(`obtainProfilesInfo did not get info for followee profile id ${profileId}`)
            continue
        }
        if (!profileData.domElement) {
            profileData.domElement = makeProfilePtag(profileData)
        } else {
            let dmscontainer = profileData.domElement.querySelector("div.dmscontainer")
            if (dmscontainer) {
                dmscontainer.textContent = ""
            }
            profileData.domElement.classList.remove("expanded")
        }
        profileData.domElement.classList.add("collapsed")
        xbinaryInsert(followeesprofilesList, profileData, compareFunc, followeeInsertFunc)
        setTimeout(function(){
            profileData.domElement.classList.remove("collapsed")
            profileData.domElement.classList.add("expanded")
        }, 100)
    }

    let fedmembersInsertFunc = insertFuncGetter(document.getElementById("serverlist"))
    for (let profileId of Object.keys(decodedResult)) {
        if (follows[profileId] || profileId == selectedIdentityProfileId) {
            continue
        }

        let profileTipCid = decodedResult[profileId]
        console.log(`profile tip for profileid ${profileId} -> ${profileTipCid}`)
        let obtainer = function(xProfileId, xProfileCid) {
            getCidContentsStringByCat(xProfileCid, true).then(function(profileJson){
                // console.log(`GOT ${xProfileId} -> ${xProfileCid} ->`, profileJson)
                let profileData = JSON.parse(profileJson)
                profileData.domElement = makeProfilePtag(profileData)
                profileData.domElement.classList.add("collapsed")

                xbinaryInsert(fedmembersprofilesList, profileData, compareFunc, fedmembersInsertFunc)

                setTimeout(function(){
                    profileData.domElement.classList.remove("collapsed")
                    profileData.domElement.classList.add("expanded")
                }, 100)
                // TODO can put something good into the dom here now
            }).catch(function(e){
                console.log(e)
                console.log(`GOT ${xProfileId} -> ${xProfileCid} -> NODATA`)
            })
        }
        obtainer(profileId, profileTipCid)
    }

    loadingProfilesInfo = false
}

function makeProfilePtag(profileData) {
    let ptag = document.createElement("p")
    ptag.innerHTML = jdenticon.toSvg(profileData.Id, 20);
    ptag.querySelector("svg").classList.add("smallicon")
    let nameTextNode = document.createTextNode(profileNametag(profileData))
    let nameSpanWrapper = document.createElement("span")
    nameSpanWrapper.appendChild(nameTextNode)
    ptag.appendChild(nameSpanWrapper)

    let atag

    if (follows[profileData.Id]) {
        if (followbacks[profileData.Id]) {
            let mailIconSpan = document.createElement("span")
            mailIconSpan.innerHTML = "&#x2709;" //come-back arrow was &#x21A9;
            mailIconSpan.style.cursor = "pointer"
            mailIconSpan.addEventListener("click", function(){
                document.getElementById("dmfor").value = profileData.Id
                showDmingStatus()
                showMainScreen()
                focusPostText()
            })

            ptag.appendChild(mailIconSpan)

            nameSpanWrapper.style.cursor = "pointer"
            nameSpanWrapper.addEventListener("click", function(){
                loadDms(profileData.Id, this)
            })

        }
        atag = makeATag("&#x2718;", function (xProfileId) {
            return async function () {
                let actuallyunFollowed = await unfollow(xProfileId)
                if (!actuallyunFollowed) {
                    return false;
                }
                showMainScreen()
                // membersprofilelistUpdate()
                // membersswap()
                // focusPostText()
                return false;
            }
        }(profileData.Id), true)

    } else {
        atag = makeATag("&#x1f465;", function (xProfileId) {
            return async function () {
                let actuallyFollowed = await follow(xProfileId)
                if (!actuallyFollowed) {
                    return false;
                }
                showMainScreen()
                // membersprofilelistUpdate()
                // membersswap()
                // focusPostText()
                return false;
            }
        }(profileData.Id), true)
    }
    ptag.appendChild(atag)
    let divwrapper = document.createElement("div")
    divwrapper.appendChild(ptag)
    return divwrapper
}

function loadDms(profileId, btnDomEl) {
    let dmContainer = document.getElementById(`dmscontainer-${profileId}`)
    if (dmContainer) {
        dmContainer.textContent = ""
    } else {
        dmContainer = document.createElement("div")
        dmContainer.id = `dmscontainer-${profileId}`
        dmContainer.classList.add("dmscontainer")
        // dmContainer.classList.add("collapsed")
        let btnContainerDiv = btnDomEl.parentElement.parentElement
        btnContainerDiv.appendChild(dmContainer)
    }
    let dms = orderedDmPostsByInteracteeProfileId[profileId]
    if (!dms) {
        return
    }
    let ourName = profilesOfInterest[selectedIdentityProfileId].DisplayName
    let theirName = profilesOfInterest[profileId].DisplayName
    for (let k in orderedDmPostsByInteracteeProfileId[profileId]) {
        let dm = orderedDmPostsByInteracteeProfileId[profileId][k]
        let tempTag = document.createElement("p")
        tempTag.classList.add(dm.From ? "from" : "to")
        tempTag.classList.add("message")
        tempTag.innerHTML = (dm.From ? theirName : ourName) + ": " + dm.PreviewText
        let timeTag = document.createElement("p")
        timeTag.classList.add(dm.From ? "from" : "to")
        timeTag.classList.add("time")
        timeTag.innerHTML = cheesyDate(dm.jsDate)
        dmContainer.appendChild(tempTag)
        dmContainer.appendChild(timeTag)
        console.log(dm)
    }

    console.log(profileId, btnDomEl)
}

async function promptToFollowCurated() {
    let limit = 1
    let curatedProfileInfoJson = await makeRequest("GET", serviceBaseUrl + `/service/curatedProfiles?limit=${limit}`)
    let curatedProfileinfo = JSON.parse(curatedProfileInfoJson)
    for (let profileId in curatedProfileinfo) {
        let profileData
        try {
            profileData = await fetchCheckProfile(profileId, curatedProfileinfo[profileId])
        } catch(e) {
            console.log(e)
        }
        let confirmText = `Would you like to follow suggested profile ${profileId}?`
        if (profileData) {
            confirmText = `Would you like to follow suggested profile ${profileNametag(profileData)}?`
        }
        if (confirm(confirmText)) {
            await follow(profileId, true)
        }
    }
}

async function experiment2() {
    // if (!ipfsStarted) {
    //     await startIpfs()
    //     ipfsStarted = true
    // }
    let pubkeyb64 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuH/gmNQTC+XXg7MV7jDPFKg06lzy1MCgIweLBDi1ZsGL9H5WhsUBz0RLLR+iGv69d5FGGDbUW5oaQkS2S3Xy+rQx/jdOObVA6InndL6Sw3fH00Sx9QeRIciGlkyqcGve1ponOFoAVcmHYPkwHBvL8vQEVvHTRD/fpXkQyDwm1rQRr5KsGu3fDF2gzSveCzBP9cyvS17NoAD6GeFuOb47SjTFsB4vZScb+Ls1XPIQTHSrxABNwzYaZVpQwYpSkNfyGZON0Mn9SCIrhjktWpBuoNJCkI7rf6+bWoMPaOfsupyk6mI2AhHKuFGfSBQV3ae5K0CyiZtABhgXQVTmjyoSgwIDAQAB"
    // let previousNodeCid = null
    let text = "something to make"
    unsignedGn = unsignedGraphNodeForPost(pubkeyb64, text )
}

function cheesyDate(dateobj) {
    // return dateobj.toISOString().split('.')[0]+"Z" //cheesy, but works. i didnt invent it.
    return moment(dateobj).fromNow()
}
async function unsignedGraphNodeForPost(pubkeyb64, text, previous, dmfor, inreplyto, followprofileid, unfollowprofileid, likeofnodecid, unlikeofnodecid, retractionofnodecid, repostofnodecid) {

    let profileId = await peerutil.peerid(pubkeyb64)
    if (!previous) {
        previous = null
    }

    let ts = (new Date()).toISOString().split('.')[0]+"Z"
    let graphNode = {
        ver:   1,
        ProfileId: profileId,
        previous: previous,
        Signature: null,
        Date: ts,
    }

    let firstPostCid
    if (text && !dmfor) {
        firstPostCid = await addContentsToIPFS(text)
        let firstPost = {
            MimeType: "text/plain",
            Cid:      firstPostCid,
            Date:     ts,
        }
        let inreplyToList = null
        if (inreplyto) {
            inreplyToList = [ inreplyto ]
        }
        firstPost.Reply = inreplyToList //just one for now this way, multireply later.
        graphNode.post = firstPost
    }
    if (text && dmfor) {
        let encryptedCidToDmPostForRecip = await getEncryptedDmPostCidForCleartextToProfileId(dmfor, text, ts)
        let encryptedCidToDmPostForSelf  = await getEncryptedDmPostCidForCleartextToProfileId(selectedIdentityProfileId, text, ts)
        let encryptedRecipProfileId = await encryptMessage(selectedIdentityProfileId, dmfor)
        // recip can see who sent it [0]
        // we can get a copy out for ourselves [1]
        // and when we see we sent this we will be able to figure out who we sent it to [2]
        graphNode.Dm = [
            arrayBufferToBase64String(encryptedCidToDmPostForRecip),
            arrayBufferToBase64String(encryptedCidToDmPostForSelf),
            arrayBufferToBase64String(encryptedRecipProfileId),
        ]
    }

    if (followprofileid) {
        graphNode.publicfollow = [followprofileid] //just one for now this way for follows as well.
    }
    if (unfollowprofileid) {
        // TODO fix these keys. there is a typo in this one. make it all consistent. maybe get rid of the lowercase stuff altogether.
        graphNode.publicufollow = [unfollowprofileid] //just one for now this way for follows as well.
    }
    if (retractionofnodecid) {
        graphNode.retraction = retractionofnodecid
    }
    if (repostofnodecid) {
        graphNode.repost = repostofnodecid
    }
    let serializedUnsignedGraphNode = stableJson(graphNode, function(a, b){
        return keyOrder["GraphNode"][a.key] > keyOrder["GraphNode"][b.key] ? 1 : -1;
    })

    console.log("unsignedGraphNodeForPost graphnode state", graphNode)
    console.log("unsignedGraphNodeForPost graphnode serialized presign", serializedUnsignedGraphNode)
    return serializedUnsignedGraphNode
}

async function getEncryptedDmPostCidForCleartextToProfileId(profileId, clearText, ts) {
    let dmCyphertextCid = await addContentsToIPFS(await encryptMessage(profileId, clearText))
    let dmPost = {
        MimeType: "text/plain",
        Cid:      dmCyphertextCid,
        Date:     ts,
    }
    let dmPostJson = JSON.stringify(dmPost)
    let dmPostCid = await addContentsToIPFS(await encryptMessage(profileId, dmPostJson))
    let encryptedDmPostCid = await encryptMessage(profileId, dmPostCid)
    return encryptedDmPostCid
}
async function unsignedProfileWithFirstPost(pubkeyb64, UnsignedGraphNodeJson, Signatureb64, DisplayName, Bio, previous, UseIPNSDelegate) {
    graphNode = JSON.parse(UnsignedGraphNodeJson) // TODO just pass in the pre-json. at time of writing i'm writing drop in replacements that dont change the process or args. but the process can change if we are doing all this in the browser.
    graphNode.Signature = Signatureb64

    let serializedSignedGraphNode = stableJson(graphNode, function(a, b){
        return keyOrder["GraphNode"][a.key] > keyOrder["GraphNode"][b.key] ? 1 : -1;
    })
    graphNodeCid = await addContentsToIPFS(serializedSignedGraphNode)

    if (!previous) {
        previous = null
    }

    let profile = {
        Id: await peerutil.peerid(pubkeyb64),
        Pubkey: pubkeyb64,
        GraphTip: graphNodeCid,
        DisplayName: DisplayName,
        Bio: Bio,
        Previous: previous,
        Signature: null,
        Date: (new Date()).toISOString().split('.')[0]+"Z"
    }
    if (UseIPNSDelegate) {
        profile.IPNSDelegate = await IPNSDelegateName() //probably always gonna need server to provide this
    }

    let serializedUnsignedProfile = stableJson(profile, function(a, b){
        return keyOrder["Profile"][a.key] > keyOrder["Profile"][b.key] ? 1 : -1;
    })
    // should look like:
    // {"Id":"QmaT8gPTHPq9z171Gcac1QLRBPctEwr1j29XNFWE5RuzBu","Pubkey":"MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuH/gmNQTC+XXg7MV7jDPFKg06lzy1MCgIweLBDi1ZsGL9H5WhsUBz0RLLR+iGv69d5FGGDbUW5oaQkS2S3Xy+rQx/jdOObVA6InndL6Sw3fH00Sx9QeRIciGlkyqcGve1ponOFoAVcmHYPkwHBvL8vQEVvHTRD/fpXkQyDwm1rQRr5KsGu3fDF2gzSveCzBP9cyvS17NoAD6GeFuOb47SjTFsB4vZScb+Ls1XPIQTHSrxABNwzYaZVpQwYpSkNfyGZON0Mn9SCIrhjktWpBuoNJCkI7rf6+bWoMPaOfsupyk6mI2AhHKuFGfSBQV3ae5K0CyiZtABhgXQVTmjyoSgwIDAQAB","GraphTip":"QmeCcKBvbK5S8fkxVX7Pj7LX92Ew4UHBSQdPZZ5mA1aQfm","DisplayName":"h","Bio":"d","Previous":"QmeAa81YkBs1WSYfiAShhZ7bgqyaCHEtjH3XDMXexx9Vwb","Signature":null,"IPNSDelegate":"QmXrsXeHJFW7k4G2EcfjTruASxC6Qzfad2FwA5nXVViHWc"}
    console.log("unsignedProfileWithFirstPost serializedUnsignedProfile:", serializedUnsignedProfile)
    return serializedUnsignedProfile
}

async function publishedProfileCid(pubkeyb64, privkeyb64, unsignedProfileJson, profileSigb64, IPNSDelegate) {
    let profile = JSON.parse(unsignedProfileJson)
    profile.Signature = profileSigb64
    let profileJson = stableJson(profile, function(a, b){
        return keyOrder["Profile"][a.key] > keyOrder["Profile"][b.key] ? 1 : -1;
    })
    let profileCid = await addContentsToIPFS(profileJson)
    let serverReportedCid = await updateProfileCidOnServer(profileJson, profileCid, IPNSDelegate, privkeyb64) //TODO maybe this call and the assembly of the final json with the signature dont belong in this function. probably outside of it before/after

    return profileCid
}

function extractFollowsProfileCids(graphnodeHistory) {
    let follows = {}
    let unfollows = {}
    for (k = 0; k < graphnodeHistory.length; k++) {
        let e = graphnodeHistory[k]

        if (!e["publicfollow"] && !e["publicufollow"]) {
            continue
        }
        if (e["publicufollow"]) {
            for (i = 0; i < e["publicufollow"].length; i++) {
                let unfollowProfileId = e["publicufollow"][i]
                if (follows[unfollowProfileId]) {
                    continue
                }
                unfollows[unfollowProfileId] = true
            }
        }
        if (e["publicfollow"]) {
            for (i = 0; i < e["publicfollow"].length; i++) {
                let followProfileId = e["publicfollow"][i]
                if (unfollows[followProfileId]) {
                    continue
                }
                follows[followProfileId] = true
            }
        }
    }
    let finalFollows = []
    for (let followProfileId of Object.keys(follows)) {
        finalFollows.push(followProfileId)
    }
    return finalFollows
}

async function fetchCheckProfile(profileId, profileCid, pubkeyb64) {
    // if (!profileCid) {
    //     profileCid = profileTipCache[profileId]
    // }
    if (!profileCid) {
        try {
            console.log(`fetchCheckProfile WELP idk about profile id ${profileId} so we're asking the server for profileBestTipCid...`)
            profileCid = await profileBestTipCid(profileId) // TODO resolve on our own w/o server stuff
            // profileTipCache[profileId] = profileCid
        } catch(e) {
            throw e
        }
        console.log("fetchCheckProfile: determined profileCid to be ", profileCid)
    } else {
        console.log("fetchCheckProfile:explicitly requesting profileCid ", profileCid)
    }
    if (!profileCid) {
        throw new Error("fetchCheckProfile could not obtain profile cid for profile id " + profileId)
    }

    console.log("fetchCheckProfile here1")
    let profileJson = await getCidContentsStringByCat(profileCid)
    if (!profileJson) {
        throw new Error("fetchCheckProfile No profile Json could be obtained for profile " + profileCid)
    }
    // console.log("here2 obtained profileJson like: ", profileJson)

    let profileData = JSON.parse(profileJson)
    if (profileData["Id"] != profileId) {
        console.log("fetchCheckProfile claimed profile id does not match requested profileId", profileData["Id"], profileId)
        throw new Error("fetchCheckProfile invalid profile with mismatched id. requested " + profileId + ", got " + profileData["Id"])
    }

    if (profileData["Previous"]) {
        console.log("fetchCheckProfile previous profile cid for this profile: " + profileData["Previous"])
    }
    console.log("fetchCheckProfile tip for profile: ", profileData["GraphTip"])

    let pubkey
    if (pubkeyb64) {
        if (pubkeyb64 != profileData["Pubkey"]) {
            throw new Error("fetchCheckProfile passed in pubkeyb64 != profileData pubkeyb64")
        }
        console.log("fetchCheckProfile, passed in pubkey b64", pubkeyb64)
        pubkey = await importProfilePubkey(profileId, pubkeyb64)
    } else {
        pubkey = await importProfilePubkey(profileId, profileData["Pubkey"])
    }
    let expectProfileId = await peerutil.peerid(profileData["Pubkey"])
    if (profileData["Id"] != expectProfileId) {
        console.log("fetchCheckProfile claimed profile id does not match computed from pubkey.", profileData["ProfileId"], expectProfileId)
        throw new Error("fetchCheckProfile invalid profile with mismatched pubkey. derived " + expectProfileId + " from pubkey, expected " + profileId)
    }

    // pubkey = getPubkeyForProfileId(profileData["Id"])
    // if (!pubkey) {
    //     pubkey = await importProfilePubkey(profileData["Id"], profileData["Pubkey"])
    // }
    let verified = await verifyProfileSig(profileData, pubkey)
    if (!verified) {
        throw new Error("fetchCheckProfile: invalid sig")
    }

    /// NOT attaching the imported pubkey to the profile data right now as the importProfilePubkey will keep track in a dict.
    return profileData
}

async function fillPostPreviewInfo(gnode) {
    if (gnode.post && gnode.post.Cid && gnode.post.MimeType) {
        if (gnode.post.MimeType != "text/plain") {
            console.log("NOT collecting contents for non-text post from cid ", gnode.post.Cid, gnode.post.MimeType)
            return
        }
        gnode.Date = gnode.post.Date
        if (checkForRetraction(gnode.Cid, gnode.ProfileId)) {
            gnode.PreviewText = "[RETRACTED]"
        } else {
            try {
                gnode.PreviewText = await getCidContentsStringByCat(gnode.post.Cid, true)
            } catch (e) {
                if (e.message == 'request timed out') {
                    gnode.PreviewText = `[timed out getting ${gnode.post.Cid}]`
                } else {
                    gnode.PreviewText = `[error getting ${gnode.post.Cid} : ${e.message}]`
                }
            }
        }
    }

    updateTimelinePost(gnode)

    // can't actually do this now so dont worry about it.
    // if (!entry.Date) {
    //     setEntryJsDate(entry)
    // }
}

async function fillRepostPreviewInfo(gnode) {
    if (!gnode.repost) {
        return
    }

    try {
        let repostGnJson = await getCidContentsByCat(gnode.repost, true)
        let repostGn = JSON.parse(repostGnJson)
        let reposteeProfile = await fetchCheckProfile(repostGn.ProfileId)
        let reposteePubkey = await importProfilePubkey(repostGn.ProfileId, reposteeProfile.Pubkey)
        let gnSigVerified = await verifyGraphNodeSig(repostGn, reposteePubkey)
        if (!gnSigVerified) {
            throw new Error(`fillRepostPreviewInfo reposted gn cid ${gnode.repost} had invalid sig`)
        }
        gnode.repostGn = repostGn
        gnode.reposteeProfile = reposteeProfile

        repostedCids[gnode.repost] = gnode //take the gnode so that if we have to redact stuff later we can check the repostGn is owned by the retractor and also find the repost preview to redact it.
        profilesOfInterest[repostGn.ProfileId] = gnode.reposteeProfile
        gnOfInterest[gnode.Cid] = gnode
        // gnOfInterestByProfileId[repostGn.ProfileId][gnode.cid] = gnode

        if (checkForRetraction(gnode.repost, gnode.reposteeProfile.Id)) {
            gnode.RepostPreviewText = "[RETRACTED]"
        } else {
            let repostText = ""
            if (repostGn.post.MimeType != "text/plain") {
                repostText = "[unsupported mimetype]"
            } else {
                repostText = await getCidContentsStringByCat(repostGn.post.Cid, true)
            }
            gnode.RepostPreviewText = repostText
        }
    } catch (e) {
        if (e.message == 'request timed out') {
            gnode.RepostPreviewText = `[timed out getting ${gnode.repost}]`
        } else {
            gnode.RepostPreviewText = `[error getting ${gnode.repost} : ${e.message}]`
        }
    }
    updateTimelineRepost(gnode)
}

function checkForRetraction(gnCid, retractedByProfileId) {
    if (retractedCids[gnCid] && retractedCids[gnCid][retractedByProfileId]) {
        return true
    }
    return false
}

async function fillHistoryPreviews(entries) {
    alert("deprecated, doing it inline! whee ... but the promise pool stuff might be useful demo")
    return

    let fillableEntries = []
    for (let i = 0; i < entries.length; i++) {
        let entry = entries[i]
        if (!entry.post || !entry.post.Cid || !entry.post.MimeType) { continue }
        if (entry.post.MimeType != "text/plain") {
            console.log("NOT collecting contents for non-text post from cid ", entry.post.Cid, entry.post.MimeType)
            continue
        }
        entry.Date = entry.post.Date
        fillableEntries.push(entry)
    }

    const maxpoolConcurrency = 20
    const entryUpdater = async function(entry) {
        return new Promise(async function(resolve) {
            try {
                entry.contents = await getCidContentsByCat(entry.post.Cid, true)
            } catch(e) {
                if (e.message == 'request timed out') {
                    entry.contents = `[timed out getting ${entry.post.Cid}]`
                    return resolve(true)
                }
                entry.contents = `[error getting ${entry.post.Cid} : ${e.message}]`
            }
            resolve(true)
        })
    }
    // const timeout = i => new Promise(resolve => setTimeout(() => resolve(i), i));
    const results = await asyncPool(maxpoolConcurrency, fillableEntries, entryUpdater);
    console.log("results: ", results)
}

async function fillHistoryRepostInfo(entries) {
    // TODO first .. have followee that is reposting in the test.
    //otherwise code similar to above
}

async function fetchGraphNodeHistory(profile, trackLoadFolloweeInfo, multihistory, stopAtKnown) {
    if (fetchingProfileMutex[profile.Id]) {
        return
    }
    fetchingProfileMutex[profile.Id] = true
    // let headGnJson = await getCidContentsByCat(profile["GraphTip"])
    console.log("fetchGraphNodeHistory to collect profile id", profile.Id)
    // headGn = JSON.parse(headGnJson)
    // console.log("here2", headGn)
    // let history = [ headGn ]
    // let followees = {}
    let history = []
    // let multihistory = {}
    multihistory[profile.Id] = history
    if (!gnOfInterestByProfileId[profile.Id]) {
        gnOfInterestByProfileId[profile.Id] = {}
    }

    let headGn = {"previous":profile["GraphTip"]}
    // let lastProcessedGn = null
    let currentGn = undefined
    let profileInteractionTracker = {}
    let followBackTracker = {}

    while (headGn["previous"] != null) {

        console.log("here3 about to getCidContentsByCat", headGn)
        let currentGnCid = headGn["previous"]
        if (stopAtKnown && gnOfInterestByProfileId[profile.Id][currentGnCid]) {
            console.log(`fetchGraphNodeHistory: stopping additional collection of data from profileId ${profile.Id} due to encountering known cid ${currentGnCid} in the history -- collected all new info for this profile.`)
            break
        }
        if (profile.Id != selectedIdentityProfileId && unfollows[profile.Id]) {
            //it is possible that WHILE we are doing this for a followee that we think we are following, that we might realize we no longer follow this profile, because async code might have hit an unfollow for them.
            //in which case there will be code that is going to remove that stuff from the dom running, and we don't want to start putting stuff back in the dom for that profile in the event that happened. is due to racyness of async stuff. not sure on better logic to deal with this kind of thing.
            console.log(`fetchGraphNodeHistory: stopping additional collection of data from profileId ${profile.Id} due the sudden realization that we no longer actually follow this profile id`)
            break
        }

        try {
            let currentGnJson = await getCidContentsByCat(currentGnCid, true)
            currentGn = JSON.parse(currentGnJson)
            console.log(`fetchGraphNodeHistory gn cid ${currentGnCid} in history of ${profile.Id}: gnode:`, currentGn)
        } catch(e) {
            console.log(`fetchGraphNodeHistory: error fetching ${currentGnCid}:`, e)
            break
        }

        let gnSigVerified = await verifyGraphNodeSig(currentGn, getPubkeyForProfileId(profile["Id"]))
        if (!gnSigVerified) {
            console.log(`encountered invalid sig in profile id ${profile["Id"]} at cid ${currentGnCid}`)
            // throw new Error("fetchGraphNodeHistory: invalid sig")
            break; //done adding stuff since we just hit invalid things.
        }
        currentGn.profile = profile
        currentGn.Cid = currentGnCid
        currentGn.Indent = 0 //temp
        // currentGn.replies = gnOfInterest[currentGnCid] && gnOfInterest[currentGnCid].replies ? gnOfInterest[currentGn.Cid].replies : []
        currentGn.replies = []

        //todo if this next/prev isnt useful then get rid of it.
        headGn.prev = currentGn
        currentGn.next = headGn.ProfileId ? headGn : null

        // currentGn.DisplayName = "nyi"
        // currentGn.Date = "0001-01-01T00:00:00Z" //maybe everything should have one tho.
        history.push(currentGn)
        gnOfInterestByProfileId[currentGn.ProfileId][currentGn.Cid] = currentGn
        gnOfInterest[currentGn.Cid] = currentGn
        // let isKnownCid = knownCidsByProfile[profile["Id"]][currentGn.Cid] ? true : false
        // if (profileTipCache[profile["Id"]] && !isKnownCid) {
        //     console.log(`fetchGraphNodeHistory saw presumanbly new, unknown gn cid ${currentGn.Cid} in history of profile ${profile.Id}`)
        // }
        // profileTipCache[profile["Id"]] = currentGn.Cid

        // gnReplyParents[currentGn.Cid] = currentGn
        await pullDmOut(currentGn)
        addGnToTimeline(currentGn)
        fillPostPreviewInfo(currentGn).catch((e)=>{console.log("fillPostPreviewInfo had err", e)})
        fillRepostPreviewInfo(currentGn).catch((e)=>{console.log("fillRepostPreviewInfo had err", e)})
        if (trackLoadFolloweeInfo) {
            // TODO break this whole bit into trackLoadFolloweeInfo()
            if (currentGn["publicufollow"]) {
                for (let i = 0; i < currentGn["publicufollow"].length; i++) {
                    let unfollowProfileId = currentGn["publicufollow"][i]
                    if (alreadyTrackedStateChangeFor(unfollowProfileId, profileInteractionTracker)) {
                        continue
                    }
                    trackStateChangeFor(unfollowProfileId, profileInteractionTracker, "unfollow")
                    unfollows[unfollowProfileId] = true
                    delete follows[unfollowProfileId]
                    removeUnfolloweePosts(unfollowProfileId)
                }
            }
            if (currentGn["publicfollow"]) {
                currentGn.followeeProfileInfo = {}
                for (let i = 0; i < currentGn["publicfollow"].length; i++) {
                    let followProfileId = currentGn["publicfollow"][i]

                    if (alreadyTrackedStateChangeFor(followProfileId, profileInteractionTracker)) {
                        getFolloweeProfileAndUpdateGn(followProfileId, currentGn).catch((e)=>{console.log("getFolloweeProfileAndUpdateGn had err", e)})
                        continue
                    }
                    trackStateChangeFor(followProfileId, profileInteractionTracker, "follow")

                    follows[followProfileId] = true
                    delete unfollows[followProfileId]

                    hideFollowButtonsForProfileId(followProfileId)
                    /// go get em tiger
                    console.log(`fetchGraphNodeHistory: welp, go get followee history for ${followProfileId}`)
                    getFillFolloweeHistory(followProfileId, multihistory, currentGn).catch((e)=>{console.log("getFillFolloweeHistory had err", e)})

                    // let getFolloweeProfileInfoOnly = false
                    // if (unfollows[followProfileId] || follows[followProfileId]) {
                    //     //either is unfollowed now, or is known to be followed already and thus the history will already have been gotten.
                    //     //just get info for display of followee on this gn if needed.
                    //     getFolloweeProfileInfoOnly = true
                    // }
                    // currentGn.followeeProfileInfo = {}
                    // if (getFolloweeProfileInfoOnly) {
                    //     console.log(`fetchGraphNodeHistory: only getFolloweeProfileAndUpdateGn for ${followProfileId}`)
                    //     getFolloweeProfileAndUpdateGn(followProfileId, currentGn).catch((e)=>{console.log("getFolloweeProfileAndUpdateGn had err", e)})
                    //     continue
                    // }

                }
            }
        }

        if (currentGn.ProfileId == "QmcBj5LhscNSX58kiiKsWVhvmtAWcHsAebBccC149dBx5S") {
            console.log("saw the target")
        }
        //followback by followees tracking
        if (currentGn.ProfileId != selectedIdentityProfileId && followBackTracker) {
            if (currentGn["publicufollow"]) {
                for (let i = 0; i < currentGn["publicufollow"].length; i++) {
                    let followeeUnfollowsProfileId = currentGn["publicufollow"][i]
                    if (followeeUnfollowsProfileId != selectedIdentityProfileId) { continue } //its not interesting if its not about us.
                    if (followBackTracker[currentGn.ProfileId] !== undefined) {
                        continue
                    }
                    followBackTracker[currentGn.ProfileId] = false
                    delete followbacks[currentGn.ProfileId]
                }
            }
            if (currentGn["publicfollow"]) {
                for (let i = 0; i < currentGn["publicfollow"].length; i++) {
                    let followeeFollowsProfileId = currentGn["publicfollow"][i]
                    if (followeeFollowsProfileId != selectedIdentityProfileId) { continue } //its not interesting if its not about us.
                    if (followBackTracker[currentGn.ProfileId] !== undefined) {
                        continue
                    }
                    followBackTracker[currentGn.ProfileId] = true
                    followbacks[currentGn.ProfileId] = true
                }
            }

        }
        headGn = currentGn
        console.log("here6")
    }
    console.log("fetchGraphNodeHistory for profile id " + profile["Id"] + " got " + history.length + " entries starting at tip " + profile["GraphTip"])
    delete fetchingProfileMutex[profile.Id]
    // for (i = 0; i < history.length; i++) {
    //     console.log(i, history[i])
    // }
    // return history
}

function alreadyTrackedStateChangeFor(profileId, profileInteractionTracker) {
    if (!profileInteractionTracker[profileId]) {
        return false
    }
    return true
}
function trackStateChangeFor(profileId, profileInteractionTracker, state) {
    profileInteractionTracker[profileId] = {}
    profileInteractionTracker[profileId][state] = true
}


let followeeProfileInfo = {}
async function getFillFolloweeHistory(profileId, multihistory, followedInGn) {
    let followeeProfile = await getFolloweeProfileAndUpdateGn(profileId, followedInGn)
    await fetchGraphNodeHistory(followeeProfile, false, multihistory, true)
}

async function getFolloweeProfileAndUpdateGn(profileId, followedInGn) {
    let followeeProfile = await getFolloweeProfileInfo(profileId)
    followedInGn.followeeProfileInfo[profileId] = followeeProfile
    updateTlFolloweeInfo(followedInGn) //<-- this would replace unknowns in tl with new info.
    return followeeProfile
}

async function getFolloweeProfileInfo(profileId) {
    let followeeProfile = {}
    try {
        followeeProfile = await fetchCheckProfile(profileId)
        followeeProfiles[profileId] = followeeProfile
        profilesOfInterest[profileId] = followeeProfile
        console.log("getFillFolloweeHistory followeeProfile", followeeProfile)
    } catch(e) {
        console.log("getFillFolloweeHistory got error from fetchCheckProfile:", e)
    }
    // followeeProfileInfo[profileId] = followeeProfile
    return followeeProfile
}


//TODO omg consistency is not my strong point. how about, titlecase all the things and stick with it??? that will ... break signatures btw.
const keyOrder = {
    Profile:{
        Id: 1,
        Pubkey: 2,
        GraphTip: 3,
        DisplayName: 4,
        Bio: 5,
        Previous: 6,
        Signature: 7,
        IPNSDelegate: 8,
        Date: 9,
    },
    GraphNode:{
        ver: 1,
        previous: 2,
        ProfileId: 3,
        post: 4,
        retraction: 5,
        repost: 6,
        publicfollow: 7,
        publicufollow: 8,
        publiclike: 9,
        publicunlike: 10,
        Signature: 11,
        Date: 12,
        Dm: 13,

        MimeType: 1,
        Cid: 2,
        Date: 3,
        Reply: 4,
    }
}
