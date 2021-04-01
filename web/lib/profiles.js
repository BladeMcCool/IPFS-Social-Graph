
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
        // if (followbacks[profileData.Id]) {
        //     let mailIconSpan = document.createElement("span")
        //     mailIconSpan.innerHTML = "&#x2709;" //come-back arrow was &#x21A9;
        //     mailIconSpan.style.cursor = "pointer"
        //     mailIconSpan.addEventListener("click", function(){
        //         document.getElementById("dmfor").value = profileData.Id
        //         showDmingStatus()
        //         showMainScreen()
        //         focusPostText()
        //     })
        //
        //     ptag.appendChild(mailIconSpan)
        //
        //     nameSpanWrapper.style.cursor = "pointer"
        //     nameSpanWrapper.addEventListener("click", function(){
        //         loadDms(profileData.Id, this)
        //     })
        //
        // }
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

    if (follows[profileData.Id] && followbacks[profileData.Id]) {
        let mailIconSpan = document.createElement("span")
        mailIconSpan.innerHTML = "&#x2709;" //come-back arrow was &#x21A9;
        mailIconSpan.style.cursor = "pointer"
        mailIconSpan.addEventListener("click", function(){
            document.getElementById("dmfor").value = profileData.Id
            showDmingStatus()
            showMainScreen()
            focusPostText()
        })
        ptag.appendChild(document.createTextNode(" - "))
        ptag.appendChild(mailIconSpan)

        nameSpanWrapper.style.cursor = "pointer"
        nameSpanWrapper.addEventListener("click", function(){
            loadDms(profileData.Id, this)
        })

    }
    let divwrapper = document.createElement("div")
    divwrapper.appendChild(ptag)
    return divwrapper
}

function loadDms(profileId, btnDomEl) {
    let dmContainer = document.getElementById(`dmscontainer-${profileId}`)
    if (!dmContainer) {
        dmContainer = document.createElement("div")
        dmContainer.id = `dmscontainer-${profileId}`
        dmContainer.classList.add("dmscontainer")
        // dmContainer.classList.add("collapsed")
        let btnContainerDiv = btnDomEl.parentElement.parentElement
        btnContainerDiv.appendChild(dmContainer)
    }

    if (dmContainer.childNodes.length > 0) {
        dmContainer.textContent = ""
        return
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
        // tempTag.innerHTML = (dm.From ? theirName : ourName) + ": " + dm.PreviewText
        tempTag.innerHTML = jdenticon.toSvg((dm.From ? profileId : selectedIdentityProfileId), 14) + dm.PreviewText

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