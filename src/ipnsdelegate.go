package main

import (
	"encoding/json"
	"errors"
	"log"
	"sync"
	"time"
)

//thoughts on IPNSDelegateFederation.
//i could start up with a list of IPNS names for other servers delegate list.
//these servers are in my IPNSDelegate federation.
//i will collect all the lists from all the IPNS entries in my federation,
//for each list, for each profileid and cid mentioned, i will add all unique pointed-to cids to a list for that profile id.
//i should attempt to fetch each cid for a profile
	//throw away any cid which mentioned the wrong profileid in the data
	//throw away any cid which can't be sigverified
	//check the content of each, if one mentions a previous that we already know, throw away the 'already known' ones.
	//walk the history from each. if any of the 'others' are seen as previous then they are 'old'.
	//if there are multiple competing histories for a cid, we cannot know which is the correct one.
	//we should be prepared to return multiple entries to caller and let them decide.
	//ui 'profile tip' box could become a dropdown that lets you select from the choices if > 1
	//selecting one choice would load the history from that version. user could decide which to build off of.


type IPNSResolverFetcher struct {
	ipnsName string
	ipfs *IPFSCommunicator
}
func (rf *IPNSResolverFetcher) ResolveFetch() (map[string]string, error){
	return rf.getCurrentDelegatedProfileCids(rf.ipnsName)
}
func (rf *IPNSResolverFetcher) getCurrentDelegatedProfileCids(delegatedIPNSName string) (map[string]string, error) {
	start := time.Now()
	log.Printf("getCurrentDelegatedProfileCids from ipns name %s ... ", delegatedIPNSName)
	currentListCid, err := rf.ipfs.resolveIPNS(delegatedIPNSName)
	if err != nil && err.Error() != "name/resolve: context deadline exceeded" {
		log.Println(err)
		return nil, err
	}
	log.Printf("getCurrentDelegatedProfileCids took %.2f sec to resolve ipnsdelegate name %s to cid %s, now must fetch content from that cid", time.Since(start).Seconds(), delegatedIPNSName, currentListCid)

	if currentListCid == "" {
		log.Printf("getCurrentDelegatedProfileCids list appears to not exist (no cid from ipns)")
		return nil, errors.New("no cid found for list")
	}
	currentList := map[string]string{}

	currentListBytes, err := rf.ipfs.getCidFileBytes(currentListCid)
	if currentListBytes == nil {
		log.Printf("getCurrentDelegatedProfileCids: actually got nothing for currentListBytes which shouldnt be a problem but ...")
	}

	if err != nil {
		log.Printf("getCurrentDelegatedProfileCids getCidFileBytes error: %s", err.Error())
		return nil, err
	}
	err = json.Unmarshal(currentListBytes, &currentList)
	if err != nil {
		log.Printf("getCurrentDelegatedProfileCids json.Unmarshal error: %s", err.Error())
		return nil, err
	}
	log.Printf("getCurrentDelegatedProfileCids got %d entries and took %.2f sec to complete", len(currentList), time.Since(start).Seconds())
	return currentList, nil
}

//func federationMember
type NameResolverListFetcher interface {
	ResolveFetch() (map[string]string, error) //the profileId -> tip-profileCid
}
type IPNSFederationMember struct {
	resolverFetcher NameResolverListFetcher
	name string
}
var Federation IPNSDelegateFederation
//var delegateIPNSMutex sync.RWMutex
//var IPNSDelegatedProfileCid = map[string]string{}
type IPNSDelegateFederation struct {
	Members                  []IPNSFederationMember
	memberNames              []string
	mutex                    sync.RWMutex
	clientUpdatesMutex       sync.RWMutex
	pubsubUpdatesMutex       sync.RWMutex
	IPNSDelegatedProfileCids map[string]string
	clientUpdatedProfileCids map[string]string
	pubsubUpdatedProfileCids map[string]string
	ipnsName                 string
	publishChannelName       string
	ipfs                     *IPFSCommunicator
	bestTips                 map[string]string
	lister                   *Lister
	initialized              bool
}
func (df *IPNSDelegateFederation) Init() {
	df.mutex.Lock()
	df.IPNSDelegatedProfileCids = map[string]string{}
	df.mutex.Unlock()
	df.clientUpdatesMutex.Lock()
	df.clientUpdatedProfileCids = map[string]string{}
	df.clientUpdatesMutex.Unlock()
	df.pubsubUpdatesMutex.Lock()
	df.pubsubUpdatedProfileCids = map[string]string{}
	df.pubsubUpdatesMutex.Unlock()

	if df.lister == nil {
		df.lister = &Lister{}
	}

	baseMember := IPNSFederationMember{
		name: "self",
		resolverFetcher: &IPNSResolverFetcher{
			ipnsName: df.ipnsName,
			ipfs:     df.ipfs,
		},
	}
	IPNSDelegatedProfileCids, err := baseMember.resolverFetcher.ResolveFetch()
	if err != nil {
		log.Printf("IPNSDelegateFederation Init Error %s", err.Error())
		IPNSDelegatedProfileCids = map[string]string{}
	}

	df.mergeInProfileTipCids(IPNSDelegatedProfileCids)

	if df.Members == nil { df.Members = []IPNSFederationMember{} }

	for _, memberIPNS := range df.memberNames {
		df.Members = append(df.Members, IPNSFederationMember{
			name: memberIPNS,
			resolverFetcher: &IPNSResolverFetcher{
				ipnsName: memberIPNS,
				ipfs:     df.ipfs,
			},
		})
		go df.subscribeToFederationPeer(memberIPNS)
	}
	df.Members = append(df.Members, baseMember)

	//df.initialized = true
	//df.RunBackgroundUpdateFetcherProcessor()
}
func (df *IPNSDelegateFederation) setLister(l *Lister) {
	df.lister = l
}

func (df *IPNSDelegateFederation) mergeInProfileTipCids(profileTipCids map[string]string) {
	df.mutex.Lock()
	defer df.mutex.Unlock()
	for profileId, profileCid := range profileTipCids {
		if df.lister.CheckBl(profileId) {
			log.Printf("mergeInProfileTipCids profileId %s is on the bl, won't be including.", profileId)
			continue
		}
		//if _, found := df.clientUpdatedProfileCids[profileId]; found {
		//	//i'm not really sure this is an actual issue .... i want to log when this happens for now and allow it.
		//	log.Printf("mergeInProfileTipCids overwriting protected profileid %s with cid %s", profileId, profileCid)
		//}
		df.IPNSDelegatedProfileCids[profileId] = profileCid
	}

	for profileId, profileCid := range df.IPNSDelegatedProfileCids {
		log.Printf("mergeInProfileTipCids after merge: %s -> %s", profileId, profileCid)
	}
}

func (df *IPNSDelegateFederation) mergeInPossiblesFromClientUpdates(profileIdsPossibleBestTips map[string]map[string]bool) {
	//TODO for this and mergeInPossiblesFromSubscriptions ... decide
	// if it makes sense to DELETE the entries from these
	// clientUpdatedProfileCids and pubsubUpdatedProfileCids after finishing with them here
	// the reasoning being the idea is they are to be inputs to this best-tip-selection thing and
	// so once that is done we dont need to keep considering these any more, if they were 'best'
	// they will have been brought into the federation main IPNSDelegatedProfileCids map.

	df.clientUpdatesMutex.Lock()
	defer df.clientUpdatesMutex.Unlock()
	for profileId, profileCid := range df.clientUpdatedProfileCids {
		if _, found := profileIdsPossibleBestTips[profileId]; !found {
			profileIdsPossibleBestTips[profileId] = map[string]bool{}
		}
		profileIdsPossibleBestTips[profileId][profileCid] = true
		delete(df.clientUpdatedProfileCids, profileId)
		// EXPERIMENTALLY ... i will delete stuff here after merging it in. same in the func below.
	}
}
func (df *IPNSDelegateFederation) mergeInPossiblesFromSubscriptions(profileIdsPossibleBestTips map[string]map[string]bool) {
	df.pubsubUpdatesMutex.Lock()
	defer df.pubsubUpdatesMutex.Unlock()
	for profileId, profileCid := range df.pubsubUpdatedProfileCids {
		if _, found := profileIdsPossibleBestTips[profileId]; !found {
			profileIdsPossibleBestTips[profileId] = map[string]bool{}
		}
		profileIdsPossibleBestTips[profileId][profileCid] = true
		delete(df.pubsubUpdatedProfileCids, profileId)
	}
}



func (df *IPNSDelegateFederation) RunBackgroundUpdateFetcherProcessor() {
	minCycleTimeSec := float64(90)
	log.Println("RunBackgroundUpdateFetcherProcessor starting up")
	for {
		start := time.Now()
		df.PullUpdatesAndSelectBestTips()
		df.initialized = true
		tookSec := time.Since(start).Seconds()
		log.Printf("RunBackgroundUpdateFetcherProcessor PullUpdatesAndSelectBestTips took %.2f sec to complete", tookSec)
		if tookSec < minCycleTimeSec {
			// make sure we don't slam it more than we have to.
			time.Sleep(time.Duration(minCycleTimeSec-tookSec) * time.Second)
		}

	}
}

func (df *IPNSDelegateFederation) PullUpdatesAndSelectBestTips() {
	// we need to go through the membership names and get all the results of the lists.
	start := time.Now()
	profileIdsPossibleBestTips := map[string]map[string]bool{}
	//wg := sync.WaitGroup{}
	log.Printf("PullUpdatesAndSelectBestTips starting ..... ")

	//TODO split this up

	for _, member := range df.Members {
		profileCids, err := member.resolverFetcher.ResolveFetch()
		if err != nil {
			log.Printf("PullUpdatesAndSelectBestTips oops for %s: %s", member.name, err.Error())
			continue
		}
		log.Printf("PullUpdatesAndSelectBestTips from %s: %#v", member.name, profileCids)
		for profileId, profileCid := range profileCids {
			if _, found := profileIdsPossibleBestTips[profileId]; !found {
				profileIdsPossibleBestTips[profileId] = map[string]bool{}
			}
			profileIdsPossibleBestTips[profileId][profileCid] = true
		}
	}

	//consider also anything that has been updated through the server directly. generally this should be the most accurate one in the end i would think, except for the client that just decided to switch to some other server.
	df.mergeInPossiblesFromClientUpdates(profileIdsPossibleBestTips)

	//and consider info that came in through pubsub.
	df.mergeInPossiblesFromSubscriptions(profileIdsPossibleBestTips)

	log.Printf("PullUpdatesAndSelectBestTips got done collecting data from %d member lists that after %.2f sec", len(df.Members),  time.Since(start).Seconds())

	//now we have to go through all that and decide what is the best one for each.
	//profileIdToTlProfile := map[string]map[string]*TLProfile{}
	profileIdToTlProfileHistoryLen := map[string]map[string]int{}
	for profileId, possibles := range profileIdsPossibleBestTips {
		possiblesCount := len(possibles)

		//profilePossbleTlProfiles, profilePossbleTlProfilesHistoryLen := df.fetchProfileAndHistoryPossibilities(profileId, possibles)
		_, profilePossbleTlProfilesHistoryLen := df.fetchProfileAndHistoryPossibilities(profileId, possibles)

		//profileIdToTlProfile[profileId] = profilePossbleTlProfiles
		profileIdToTlProfileHistoryLen[profileId] = profilePossbleTlProfilesHistoryLen
		log.Printf("PullUpdatesAndSelectBestTips went thru %d possibles for %s and ended up with %d possibilities", possiblesCount, profileId, len(possibles))
	}

	finalBestTips := map[string]string{}
	for profileId, possibles := range profileIdsPossibleBestTips {
		//i believe it would be multiple competing chains in this case ...
		//which one is the best one?
		//the one with the longest history i guess, like btc.
		// TODO maybe if the "wrong" one would be selected by default for some reason here, we could have a way for the profile owner to explicitly nuke that old/discared version of the timeline? maybe just start a new identity lol
		//var longestHistoryTlProfile *TLProfile
		longestHistory := 0
		var bestProfileTipCid string
		//if profileIdToTlProfileHistoryLen[profileId] == nil {
		//	continue
		//}
		for possibleProfileTip, _ := range possibles {
			log.Printf("PullUpdatesAndSelectBestTips dbg consider for %s ...%s (len: %d)", profileId, possibleProfileTip, profileIdToTlProfileHistoryLen[profileId][possibleProfileTip])
			if profileIdToTlProfileHistoryLen[profileId][possibleProfileTip] > longestHistory {
				longestHistory = profileIdToTlProfileHistoryLen[profileId][possibleProfileTip]
				bestProfileTipCid = possibleProfileTip
				log.Printf("PullUpdatesAndSelectBestTips dbg best tip so far for %s -> %s (len: %d)", profileId, bestProfileTipCid, longestHistory)
			}
		}
		if bestProfileTipCid != "" {
			finalBestTips[profileId] = bestProfileTipCid
		}
	}
	for profileId, profileCid := range finalBestTips {
		log.Printf("PullUpdatesAndSelectBestTips final best tip: %s -> %s", profileId, profileCid)
	}
	df.mergeInProfileTipCids(finalBestTips)
	log.Printf("PullUpdatesAndSelectBestTips finished going through info gathered from %d federation members for %d total uniqe profileIds", len(df.Members), len(profileIdsPossibleBestTips))
}


func (df *IPNSDelegateFederation) fetchProfileAndHistoryPossibilities(profileId string, possibles map[string]bool) (map[string]*TLProfile, map[string]int) {
	profilePossbleTlProfiles := map[string]*TLProfile{}
	profilePossbleTlProfilesHistoryLen := map[string]int{}
	for possibleProfileTip, _ := range possibles {
		TLProfile, _ := UtilityTimeline.fetchCheckProfile(profileId, &possibleProfileTip)
		if TLProfile == nil {
			continue
		}
		profilePossbleTlProfiles[possibleProfileTip] = TLProfile

		//grab the history from this point of view. if we find any of the 'previous' values in our possibles, delete those.
		profileHistory, err := UtilityTimeline.fetchProfileHistory(TLProfile)
		if err != nil {
			continue
		}
		profilePossbleTlProfilesHistoryLen[possibleProfileTip] = len(profileHistory)
		for _, profileNode := range profileHistory  {
			if profileNode.Previous == nil { continue }
			delete(possibles, *profileNode.Previous)
			//if _, found := possibles[*node.Previous]; found {
			//}
		}
	}
	return profilePossbleTlProfiles, profilePossbleTlProfilesHistoryLen
}

func (df *IPNSDelegateFederation) Get(profileId string) *string {
	df.mutex.RLock()
	defer df.mutex.RUnlock()
	val, found := df.IPNSDelegatedProfileCids[profileId]
	if !found {
		return nil
	}
	return &val
}
func (df *IPNSDelegateFederation) GetAllJson() ([]byte, error) {
	df.mutex.RLock()
	defer df.mutex.RUnlock()
	mapJson, err := json.Marshal(df.IPNSDelegatedProfileCids)
	if err != nil {
		return nil, err
	}
	return mapJson, nil
}
func (df *IPNSDelegateFederation) Set(profileId, profileCid string) {
	df.mutex.Lock()
	defer df.mutex.Unlock()
	df.IPNSDelegatedProfileCids[profileId] = profileCid
	df.clientUpdatedProfileCids[profileId] = profileCid
}
func (df *IPNSDelegateFederation) Del(profileId string) {
	df.mutex.Lock()
	defer df.mutex.Unlock()
	delete(df.IPNSDelegatedProfileCids, profileId)
}



func (df *IPNSDelegateFederation) publishDelegatedIPNSUpdate() {
	if (!df.initialized) {
		log.Printf("publishDelegatedIPNSUpdate: initialization not yet complete -- skipping for now ...")
		return
	}
	log.Println("publishDelegatedIPNSUpdate ...")
	//log.Printf("current list: %#v", currentList)
	df.mutex.RLock()
	updatedListBytes, err := json.Marshal(df.IPNSDelegatedProfileCids)
	df.mutex.RUnlock()
	if err != nil {
		log.Println(err)
		return
	}
	updatedListCid := df.ipfs.addContentToIPFS(updatedListBytes)
	ipnsname := df.ipfs.publishIPNSUpdate(updatedListCid, df.ipfs.IPNSDelegateKeyName)
	//log.Printf("ipns update for profileid %s with profile tip cid of %s complete -- got new master dict cid of %s (using delegated ipns %s)", profile.Id, profileCid, updatedListCid, ipnsname)
	log.Printf("publishDelegatedIPNSUpdate ipns update for delegates complete -- published new master dict cid of %s using delegated ipns %s", updatedListCid, ipnsname)
}


type tipNote struct {
	ProfileId string
	ProfileCid string
}
func (df *IPNSDelegateFederation) publishToSubscribers(profileId, profileCid string) {
	bytes, err := json.Marshal(tipNote{profileId, profileCid})
	if err != nil {
		log.Printf("publishToSubscribers: err marshalling json: %s", err.Error())
		return
	}
	err = df.ipfs.shell.PubSubPublish(df.publishChannelName, string(bytes))
	log.Printf("publishToSubscribers: just published %d bytes to %s", len(bytes), df.publishChannelName)
	if err != nil {
		log.Printf("publishToSubscribers: err doing ipfs PubSubPublish: %s", err.Error())
		return
	}
}

func (df *IPNSDelegateFederation) subscribeToFederationPeer(ipnsName string) {
	subStream, err := df.ipfs.shell.PubSubSubscribe(ipnsName)
	if err != nil {
		log.Printf("subscribeToFederationPeer: got err when trying to subscribe to %s: %s", ipnsName, err.Error())
	}
	log.Printf("subscribeToFederationPeer: subscribing to federation member: %s", ipnsName)
	for {
		msg, err := subStream.Next()
		if err != nil {
			log.Printf("subscribeToFederationPeer got err: %s", err.Error())
			continue
		}
		//OK this check below is complicated by the fact that the pubsub is going to use the server builtin key, NOT the ipns
		if msg.From.String() != ipnsName {
			log.Printf("subscribeToFederationPeer got msg from unauthorized origin: %s", msg.From)
			log.Printf("message looked like: %#v", msg)
			continue
		}
		incomingTipNote := tipNote{}
		err = json.Unmarshal(msg.Data, &incomingTipNote)
		if err != nil {
			log.Printf("subscribeToFederationPeer got json unmarshal err: %s trying to process json like: %s", err.Error(), string(msg.Data))
			continue
		}
		df.pubsubUpdatesMutex.Lock()
		df.pubsubUpdatedProfileCids[incomingTipNote.ProfileId] = incomingTipNote.ProfileCid // for consideration during the background job to update federation
		go df.updateCacheIfAllowed(incomingTipNote.ProfileId, incomingTipNote.ProfileCid) //for immediate consideration to update cache -- has to crawl profile history to make sure its the best first
		df.pubsubUpdatesMutex.Unlock()
		log.Printf("subscribeToFederationPeer got msg from %s: %s -> %s", msg.From, incomingTipNote.ProfileId, incomingTipNote.ProfileCid)
	}

}

func (df *IPNSDelegateFederation) updateCacheIfAllowed(profileId, profileCid string) {
	//take what we just got and compare to what else we might have for a best tip, cached or from federation
	possibles := map[string]bool{
		profileCid:true,
	}
	cachedOrFederatedTip := ""
	if cachedTip, cached := df.ipfs.checkCachedProfileIds(profileId); cached {
		cachedOrFederatedTip = cachedTip
		//would have been recently pushed through the server in the only normal place that updateCacheEntry gets called.
	} else {
		federatedTip := Federation.Get(profileId)
		if federatedTip != nil {
			cachedOrFederatedTip = *federatedTip
		}
	}
	if cachedOrFederatedTip != "" {
		if cachedOrFederatedTip == profileCid {
			//nothing to do then, were just told to update to the one we already have.
			log.Printf("updateCacheIfAllowed: aborting due to requested new tip for profile %s matching the existing cached or federated value of %s", profileId, cachedOrFederatedTip)
			return
		}
		//we should compare against this other one.
		possibles[cachedOrFederatedTip] = true
	}
	profilePossbleTlProfiles, profilePossbleTlProfilesHistoryLen := df.fetchProfileAndHistoryPossibilities(profileId, possibles)
	//_, _ = profilePossbleTlProfiles, profilePossbleTlProfilesHistoryLen
	//if it turns out the one we got called with is actually the best (longest) one, then go with it. otherwise bail.

	longestHistory := 0
	var bestProfileTipCid string
	for possibleProfileTip, len := range profilePossbleTlProfilesHistoryLen {
		if len > longestHistory {
			longestHistory = len
			bestProfileTipCid = possibleProfileTip
		}
	}
	if bestProfileTipCid != profileCid {
		log.Printf("updateCacheIfAllowed: thinks the profile id %s tip cid %s given in here is NOT the new best, and will NOT be replacing cachced entry .", profileId, profileCid)
		return
	}
	log.Printf("updateCacheIfAllowed: thinks the profile id %s tip cid %s given in here is the new best. updating Cache with it.", profileId, profileCid)
	profileForUpdateLog := profilePossbleTlProfiles[profileCid]
	df.ipfs.updateCacheEntry(profileForUpdateLog.Profile, profileCid)
}
