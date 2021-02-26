package main

import (
	"encoding/json"
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
	log.Printf("getCurrentDelegatedProfileCids ...")
	currentListCid, err := rf.ipfs.resolveIPNS(delegatedIPNSName)
	if err != nil && err.Error() != "name/resolve: context deadline exceeded" {
		log.Println(err)
		return nil, err
	}
	log.Printf("getCurrentDelegatedProfileCids took %.2f sec to get delegatedIPNS profile list.", time.Since(start).Seconds())

	currentList := map[string]string{}
	if currentListCid != "" {
		currentListBytes, err := rf.ipfs.getCidFileBytes(currentListCid)
		if currentListBytes == nil {
			log.Printf("actually got nothing for currentListBytes which shouldnt be a problem but ...")
		}

		if err != nil {
			log.Println(err)
			return nil, err
		}
		err = json.Unmarshal(currentListBytes, &currentList)
		if err != nil {
			log.Println(err)
			return nil, err
		}
	} else {
		log.Printf("current list appears to not exist (no cid from ipns, so create new)")
	}
	log.Printf("getCurrentDelegatedProfileCids took %.2f sec to complete", time.Since(start).Seconds())
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
	Members []IPNSFederationMember
	memberNames []string
	mutex sync.RWMutex
	IPNSDelegatedProfileCids map[string]string
	ipnsName string
	ipfs *IPFSCommunicator
	bestTips map[string]string
	initialized bool
}
func (df *IPNSDelegateFederation) Init() {
	baseMember := IPNSFederationMember{
		name: "self",
		resolverFetcher: &IPNSResolverFetcher{
			ipnsName: df.ipnsName,
			ipfs:     df.ipfs,
		},
	}
	IPNSDelegatedProfileCids, err := baseMember.resolverFetcher.ResolveFetch()

	df.mutex.Lock()
	defer df.mutex.Unlock()
	if err != nil {
		log.Printf("IPNSDelegateFederation: Init err: %s", err.Error())
		df.IPNSDelegatedProfileCids = map[string]string{}
		return
	}
	df.IPNSDelegatedProfileCids = IPNSDelegatedProfileCids
	if df.Members == nil { df.Members = []IPNSFederationMember{} }

	for _, memberIPNS := range df.memberNames {
		df.Members = append(df.Members, IPNSFederationMember{
			name: memberIPNS,
			resolverFetcher: &IPNSResolverFetcher{
				ipnsName: memberIPNS,
				ipfs:     df.ipfs,
			},
		})
	}
	df.Members = append(df.Members, baseMember)

	//df.initialized = true
	//df.RunBackgroundUpdateFetcherProcessor()
}
func (df *IPNSDelegateFederation) RunBackgroundUpdateFetcherProcessor() {
	minCycleTimeSec := float64(90)
	log.Println("RunBackgroundUpdateFetcherProcessor starting up")
	for {
		start := time.Now()
		df.ExperimentalInit()
		tookSec := time.Since(start).Seconds()
		log.Printf("RunBackgroundUpdateFetcherProcessor ExperimentalInit took %.2f sec to complete", tookSec)
		if tookSec < minCycleTimeSec {
			// make sure we don't slam it more than we have to.
			time.Sleep(time.Duration(minCycleTimeSec-tookSec) * time.Second)
		}

	}
}

func (df *IPNSDelegateFederation) ExperimentalInit() {
	// we need to go through the membership names and get all the results of the lists.
	start := time.Now()
	profileIdsPossibleBestTips := map[string]map[string]bool{}
	//wg := sync.WaitGroup{}

	for _, member := range df.Members {
		profileCids, err := member.resolverFetcher.ResolveFetch()
		if err != nil {
			log.Printf("IPNSDelegateFederation oops for %s: %s", member.name, err.Error())
			return
		}
		log.Printf("IPNSDelegateFederation from %s: %#v", member.name, profileCids)
		for profileId, profileCid := range profileCids {
			if _, found := profileIdsPossibleBestTips[profileId]; !found {
				profileIdsPossibleBestTips[profileId] = map[string]bool{}
			}
			profileIdsPossibleBestTips[profileId][profileCid] = true
		}
	}
	//
	//for _, xMemberName := range df.memberNames {
	//	wg.Add(1)
	//	membercount++
	//	go func(memberName string) {
	//		defer wg.Done()
	//		profileCids, err := df.getCurrentDelegatedProfileCids(memberName)
	//		if err != nil {
	//			log.Printf("IPNSDelegateFederation oops for %s: %s", memberName, err.Error())
	//			return
	//		}
	//		log.Printf("IPNSDelegateFederation from %s: %#v", memberName, profileCids)
	//		df.mutex.RLock()
	//		for profileId, profileCid := range profileCids {
	//			if _, found := profileIdsPossibleBestTips[profileId]; !found {
	//				profileIdsPossibleBestTips[profileId] = map[string]bool{}
	//			}
	//			profileIdsPossibleBestTips[profileId][profileCid] = true
	//		}
	//		df.mutex.RUnlock()
	//	}(xMemberName)
	//}
	//log.Printf("IPNSDelegateFederation Init waiting for %d member lists to get found and loaded", membercount)
	//wg.Wait()
	log.Printf("IPNSDelegateFederation Init got done collecting data from %d member lists that after %.2f sec", len(df.Members),  time.Since(start).Seconds())

	//now we have to go through all that and decide what is the best one for each.
	profileIdToTlProfile := map[string]map[string]*TLProfile{}
	profileIdToTlProfileHistoryLen := map[string]map[string]int{}
	for profileId, possibles := range profileIdsPossibleBestTips {
		possiblesCount := len(possibles)
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
			profilePossbleTlProfilesHistoryLen[possibleProfileTip] = len(profileHistory)
			if err != nil { continue }
			for _, profileNode := range profileHistory  {
				if profileNode.Previous == nil { continue }
				delete(possibles, *profileNode.Previous)
				//if _, found := possibles[*node.Previous]; found {
				//}
			}
		}
		profileIdToTlProfile[profileId] = profilePossbleTlProfiles
		profileIdToTlProfileHistoryLen[profileId] = profilePossbleTlProfilesHistoryLen
		log.Printf("went thru %d possibles for %s and ended up with %d possibilities", possiblesCount, profileId, len(possibles))
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
		for possibleProfileTip, _ := range possibles {
			if profileIdToTlProfileHistoryLen[profileId] == nil {
				continue
			}
			if profileIdToTlProfileHistoryLen[profileId][possibleProfileTip] > longestHistory {
				longestHistory = profileIdToTlProfileHistoryLen[profileId][possibleProfileTip]
				bestProfileTipCid = possibleProfileTip
			}
		}
		if bestProfileTipCid != "" {
			finalBestTips[profileId] = bestProfileTipCid
		}
	}
	df.IPNSDelegatedProfileCids = finalBestTips
	df.initialized = true
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
func (df *IPNSDelegateFederation) Set(profileId, profileCid string) {
	df.mutex.Lock()
	defer df.mutex.Unlock()
	df.IPNSDelegatedProfileCids[profileId] = profileCid
}
func (df *IPNSDelegateFederation) Del(profileId string) {
	df.mutex.Lock()
	defer df.mutex.Unlock()
	delete(df.IPNSDelegatedProfileCids, profileId)
}



func (df *IPNSDelegateFederation) publishDelegatedIPNSUpdate() {
	if (!df.initialized) {
		log.Printf("publishDelegatedIPNSUpdate: not initialized, skipping for now ...")
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
	log.Printf("ipns update for delegates complete -- got new master dict cid of %s (using delegated ipns %s)", updatedListCid, ipnsname)
}

