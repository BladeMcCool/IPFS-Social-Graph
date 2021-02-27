package main

import (
	"crypto"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"
)

type TlGraphNode struct {
	*GraphNode
	profile      *TLProfile
	cid          string
	replies      []*TlGraphNode
	previousNode *TlGraphNode
	parentNode *TlGraphNode
	PreviewText  string //TODO .. this maybe should be in the graphnode itself .... think about it
}

type TLProfile struct {
	*Profile
	pubkey *rsa.PublicKey
	privkey *rsa.PrivateKey
	timeline *Timeline
	cid string //cid where this particular incarnation of the profile was found (note, these change but profileIds do not)
	//ipfsKeyName string //the name of the key file in the keystore that ipfs creates for us. --- update durr that should be its peerid derived from pubkey ... so no.
	follows map[string]*TLProfile
	previousProfileNode *TLProfile
}

type TLCreateProfileArgs struct {
	DisplayName string
	Bio string
	FirstPostText string
	TimeService TimeService
	IPNSDelegated bool
	PrivateKey *rsa.PrivateKey
}

type TimeService interface {
	GetTime() JSONTime
}
type defaultTimeService struct {}
func (dts *defaultTimeService) GetTime() JSONTime {
	return JSONTime(time.Now().UTC())
}

type Timeline struct {
	crypter   *CryptoUtil
	ipfs      *IPFSCommunicator
	profileId string //aka peerid for the ipfs private key, aka the ipns name (unless this profile owner can't pub to ipns directly in which case they may have a delegate server-owner-peerid specified ...
	profile   *TLProfile
	history   []*TlGraphNode
	timeService TimeService
	ipnsDelegated bool
}

func CreateTimelineWithFirstTextPost(createArgs *TLCreateProfileArgs) (*Timeline, error) {
	tl := &Timeline{
		crypter: Crypter,
		ipfs: IPFS,
		timeService: createArgs.TimeService,
	}
	if tl.timeService == nil {
		log.Printf("using default time service")
		tl.timeService = &defaultTimeService{}
	}
	err := tl.CreateProfileWithFirstTextPost(createArgs)
	return tl, err
}

func (tl *Timeline) NewTLGraphNode() *TlGraphNode {
	return &TlGraphNode{
		GraphNode: &GraphNode{
			Version: 1,
			ProfileId: tl.profileId,
		},
		profile: tl.profile,
	}
}


func (tl *Timeline) CreateProfileWithFirstTextPost(createArgs *TLCreateProfileArgs) (error) {

	//var privateKey *rsa.PrivateKey
	var err error
	privateKey := createArgs.PrivateKey
	if privateKey == nil {
		privateKey, err = tl.crypter.genKey()
	}
	tl.profileId = tl.crypter.getPeerIDBase58FromPubkey(&privateKey.PublicKey)
	if !createArgs.IPNSDelegated {
		//ipfsKeyName := slug.Make(createArgs.DisplayName)
		//err := tl.ipfs.makeKeyInIPFS(ipfsKeyName)
		//log.Printf("key/gen: key with name '%s' already exists", ipfsKeyName)
		err = Crypter.writeBinaryIPFSRsaKey(privateKey, tl.profileId)
		if err != nil {
			return err
		}
		//privateKey = tl.crypter.readBinaryIPFSRsaKey(ipfsKeyName)
	}

	//tl.profileId = tl.crypter.getPeerIDBase58FromPubkey(&privateKey.PublicKey)

	//graphNodeCid := tl.publishTextPostGraphNode(privateKey, &createArgs.FirstPostText, nil, nil, nil)

	graphNode := tl.NewTLGraphNode()
	graphNode.AddPost(tl.makeTextPost(createArgs.FirstPostText))
	//graphNode.SetPrevious()
	//graphNode.AddPublicFollow()
	graphNode.Sign(privateKey, tl.crypter)
	graphNodeCid, err := tl.publishGraphNodeToIPFS(graphNode.GraphNode)
	if err != nil { return err }

	profile := tl.createSignedProfile(privateKey, createArgs.DisplayName, createArgs.Bio, graphNodeCid, nil)
	profileCid := tl.publishProfileToIPFS(profile)

	//tl.profileId = profile.Id
	tl.history = []*TlGraphNode{}
	tl.profile = &TLProfile{
		Profile: profile,
		pubkey: &privateKey.PublicKey,
		privkey: privateKey,
		cid: profileCid,
		timeline: tl,
	}

	if !createArgs.IPNSDelegated {
		//this is a blocking slow operation right now, so maybe avoid unless really desired.
		//or put it in a goroutine if we are doing this. i dont think realisitcally we can be doing this so probably eventually will remove.
		tl.ipfs.publishIPNSUpdate(profileCid, tl.profile.Id)
	}

	return nil
}

func (tl *Timeline) NewTextPostGraphNode(postText string) (*TlGraphNode, error) {
	graphNode := tl.NewTLGraphNode()
	graphNode.AddPost(tl.makeTextPost(postText))
	//graphNode.Sign(tl.profile.privkey, tl.crypter)
	return graphNode, nil
}

func (tl *Timeline) PublishGraphNode(graphNode *TlGraphNode) (string, error) {
	//sign it, publish it, update profile tip, sign profile, publish profile update, return the cid of the new graphnode we did it all for
	graphNode.SetPrevious(tl.profile.GraphTip)
	graphNode.Sign(tl.profile.privkey, tl.crypter)
	graphNodeCid, err := tl.publishGraphNodeToIPFS(graphNode.GraphNode)
	if err != nil {
		return "", err
	}
	graphNode.cid = graphNodeCid
	tl.profile.GraphTip = graphNodeCid
	var previous = tl.profile.cid
	tl.profile.Previous = &previous
	tl.signProfile(tl.profile.Profile, tl.profile.privkey) //TODO this should kinda not need args.
	updatedProfileCid := tl.publishProfileToIPFS(tl.profile.Profile)
	tl.profile.cid = updatedProfileCid

	//todo add to tl.history here? also in CreateProfileWithFirstTextPost ?

	return updatedProfileCid, nil
}

func (tl *Timeline) LoadProfile() error {
	start := time.Now()
	//get profile bytes unmarshalled into struct
	var err error
	tl.profile, err = tl.fetchCheckProfile(tl.profileId, nil)
	if err != nil {
		return err
	}
	log.Printf("LoadProfile for id %s / %s, completed in %.2f sec", tl.profileId, tl.profile.DisplayName, time.Since(start).Seconds())
	return nil
}

func (tl *Timeline) fetchCheckProfile(profileId string, profileCid *string) (*TLProfile, error) {
	//resolve ipns
	var err error
	if profileCid == nil {
		profileCid, err = tl.ipfs.determineProfileCid(profileId)
		if err != nil {
			return nil, err
		}
		log.Printf("fetchCheckProfile: determined profileCid to be %s", *profileCid)
	} else {
		log.Printf("fetchCheckProfile: explicitly requesting profileCid %s", *profileCid)
	}
	if profileCid == nil {
		return nil, errors.New(fmt.Sprintf("could not obtain profile cid for profile id %s", profileId))
	}
	//get profile bytes unmarshalled into struct
	profileBytes, err := tl.ipfs.getCidFileBytes(*profileCid)
	if err != nil {
		return nil, err
	}
	profile := &TLProfile{
		follows: map[string]*TLProfile{},
		cid: *profileCid,
	}
	log.Printf("fetchCheckProfile to fetch profile id %s got raw profile bytes as string: %s", profileId, string(profileBytes))
	err = json.Unmarshal(profileBytes, profile)
	if err != nil {
		return nil, err
	}
	log.Printf("fetchCheckProfile to fetch profile id %s ('%s') got: %#v", profileId, profile.DisplayName, profile)
	if profile.Id != profileId {
		return nil, fmt.Errorf("invalid profile with mismatched id. got %s, expected %s", profile.Id, profileId)
	}

	if profile.Previous != nil {
		log.Printf("fetchCheckProfile previous profile cid for this profile: %s", *profile.Previous)
	}
	log.Printf("fetchCheckProfile tip for profile: %s", profile.GraphTip)

	//set pubkey
	pubkey, err := x509.ParsePKCS1PublicKey(profile.Pubkey)
	if err != nil {
		return nil, err
	}

	derivedProfileId := tl.crypter.getPeerIDBase58FromPubkey(pubkey)
	if derivedProfileId != profileId {
		return nil, fmt.Errorf("invalid profile with mismatched pubkey. derived %s from pubkey, expected %s", derivedProfileId, profileId)
	}

	//verify self-signature of profile.
	_, err = tl.checkProfileSignature(profile.Profile, pubkey)
	if err != nil {
		log.Printf("INVALID SIG")
		return nil, err
	}
	profile.pubkey = pubkey
	return profile, nil
}


func (tl *Timeline) LoadHistory() error {
	start := time.Now()
	graphNodeHistory, err := tl.fetchGraphNodeHistory(tl.profile)
	if err != nil {
		return err
	}
	//tl.history = graphNodeHistory
	log.Printf("LoadHistory: fetched main history for %s by %.2f sec", tl.profile.DisplayName, time.Since(start).Seconds())

	//get a list of profiles we follow by going through our own history
	followees := tl.extractFollowsProfileCids(graphNodeHistory)
	log.Printf("%s has %d followees: %#v", tl.profile.DisplayName, len(followees), followees)
	//get the history of each the people we follow.
	//we'd be interested in showing their posts and replies-to-us in our timeline too
	interestedCidNodes:= map[string]*TlGraphNode{}
	for _, tlGraphNode := range graphNodeHistory {
		if tlGraphNode.Post == nil { continue }
		interestedCidNodes[tlGraphNode.cid] = tlGraphNode
	}
	followeeHistories := [][]*TlGraphNode{}
	followeesProfileIdDeduplication := map[string]bool{}
	//i think we need to get the cid->node info out for followees posts and replies to stuff too.

	type tlFolloweeWithHistory struct {
		profileId string
		profile *TLProfile
		history []*TlGraphNode
		error error
	}
	queue := make(chan tlFolloweeWithHistory, 1)

	// Create our data and send it into the queue.
	for _, followeeProfileId := range followees {
		if _, seen := followeesProfileIdDeduplication[followeeProfileId]; seen {
			continue
		}
		followeesProfileIdDeduplication[followeeProfileId] = true
	}
	deduped := []string{}
	for followeeProfileId, _ := range followeesProfileIdDeduplication {
		deduped = append(deduped, followeeProfileId)
	}

	wg := sync.WaitGroup{}
	wg.Add(len(deduped))

	for idx, followeeProfileId := range deduped {
		go func(followeeProfileId string, idx int) {
			followeeProfile, err := tl.fetchCheckProfile(followeeProfileId, nil)
			if err != nil {
				log.Printf("could not get profile for followee with profile id %s: %s", followeeProfileId, err.Error())
				queue <- tlFolloweeWithHistory{error: err, profileId: followeeProfileId}
				return
			}
			log.Printf("collecting profile history for %s followee #%d: %s...", tl.profile.DisplayName, idx, followeeProfile.DisplayName)
			followeeGraphNodeHistory, err := tl.fetchGraphNodeHistory(followeeProfile)
			if err != nil {
				queue <- tlFolloweeWithHistory{error: err, profileId: followeeProfileId}
				return
			}
			for _, tlGraphNode := range followeeGraphNodeHistory {
				if tlGraphNode.Post == nil { continue }
				interestedCidNodes[tlGraphNode.cid] = tlGraphNode
			}
			queue <- tlFolloweeWithHistory{
				profileId: followeeProfileId,
				profile: followeeProfile,
				history: followeeGraphNodeHistory,
			}
		}(followeeProfileId, idx)
	}
	go func() {
		for t := range queue {
			if t.error == nil {
				tl.profile.follows[t.profileId] = t.profile
				followeeHistories = append(followeeHistories, t.history)
			} else {
				//log.Printf("%#v", t)
				log.Printf("error from fetching followed profile %s: %s", t.profileId, t.error.Error())
			}
			wg.Done()
		}
	}()
	wg.Wait()

	//for idx, followeeProfileId := range followees {
	//	if _, seen := followeesProfileIdDeduplication[followeeProfileId]; seen {
	//		continue
	//	}
	//	followeesProfileIdDeduplication[followeeProfileId] = true
	//
	//	followeeProfile, err := tl.fetchCheckProfile(followeeProfileId, nil)
	//	if err != nil {
	//		log.Printf("could not get profile for followee with profile id %s: %s", followeeProfileId, err.Error())
	//		return err
	//	}
	//	log.Printf("collecting profile history for %s followee #%d: %s...", tl.profile.DisplayName, idx, followeeProfile.DisplayName)
	//	tl.profile.follows[followeeProfileId] = followeeProfile
	//	followeeGraphNodeHistory, err := tl.fetchGraphNodeHistory(followeeProfile)
	//	if err != nil {
	//		return err
	//	}
	//	for _, tlGraphNode := range followeeGraphNodeHistory {
	//		if tlGraphNode.Post == nil { continue }
	//		interestedCidNodes[tlGraphNode.cid] = tlGraphNode
	//	}
	//	followeeHistories = append(followeeHistories, followeeGraphNodeHistory)
	//}
	log.Printf("LoadHistory: fetched followee histories for %s by %.2f sec", tl.profile.DisplayName, time.Since(start).Seconds())

	//tl.history = graphNodeHistory
	tl.insertReplies(interestedCidNodes, graphNodeHistory)
	for _, followeeGraphNodeHistory := range followeeHistories {
		tl.history = append(tl.history, followeeGraphNodeHistory...)
		tl.insertReplies(interestedCidNodes, followeeGraphNodeHistory)
	}
	//log.Printf("LoadHistory: inserted replies by %.2f sec", time.Since(start).Seconds())

	tl.organizeHistory(append(followeeHistories, graphNodeHistory))
	log.Printf("LoadHistory: organized and completed for %s by %.2f sec", tl.profile.DisplayName, time.Since(start).Seconds())

	knownFollowers := []string{} //one way to populate some of this is if anyone we follow follows us back.
	_ = knownFollowers
	_ = followees
	return nil
}

func  (tl *Timeline) organizeHistory(histories [][]*TlGraphNode) {
	start := time.Now()
	//get the "next newest" bundle of stuff from each history. find a post with a timestamp.
	//the newest of these bundles gets added to the ordered history. extract a replacement 'next newest bundle' for that one.
	//repeat until each history is empty
	log.Printf("organizeHistory: ordered history for %s ... flatten %d histories", tl.profileId, len(histories))
	orderedHistory := []*TlGraphNode{}
	historyBundles := map[string][]*TlGraphNode{}
	historyPreviousNodes := map[string]*TlGraphNode{}
	//reachedAllHistoryRoots := false

	for _, history := range histories {
		historyPreviousNodes[history[0].ProfileId] = history[0]
	}

	for {
		//extractedNewHistory := false
		for profileId, curNode := range historyPreviousNodes {
			//_ = profileId
			if curNode == nil {
				//log.Printf("believed to have already reached the beginning of profile id %s, no more to get for them.", profileId)
				continue
			}
			if _, found := historyBundles[profileId]; found {
				//already extracted a bundle and havent put it in the history yet, so dont replace it yet.
				//log.Printf("currently sitting on %d entries for %s, not getting more yet.", len(historyBundles[profileId]), curNode.profile.DisplayName)
				continue
			}
			//extractedNewHistory = true
			historyBundle := getHistoryTlGraphNodesToNextPost(curNode)
			if len(historyBundle) > 0 {
				historyBundles[profileId] = historyBundle
				historyPreviousNodes[profileId] = historyBundle[len(historyBundle)-1].previousNode
				sortReplies(historyBundle)
			} else {
				historyPreviousNodes[profileId] = nil
			}
			log.Printf("pulled out %d entries for next newest of %s", len(historyBundles[profileId]), curNode.profile.DisplayName)
		}
		if len(historyBundles) == 0 {
			//log.Printf("seems there is no more history to deal with.")
			break
		}
		//if !extractedNewHistory {
		//	reachedAllHistoryRoots = true
		//}
		newestBundleTimestamp := time.Time{}
		newestBundle := []*TlGraphNode{}
		for profileId, bundle := range historyBundles {
			_ = profileId
			//last element should always be a post with a timestamp
			postTime := time.Time(bundle[len(bundle)-1].Post.Date)
			if postTime.After(newestBundleTimestamp) {
				newestBundleTimestamp = postTime
				newestBundle = bundle
			}
		}
		//log.Printf("newest bundle this round was from %s with a 'oldest' timestamp of %s, %d entries in the bundle.", newestBundle[0].profile.DisplayName, newestBundleTimestamp.Format("2006-01-02 15:04:05"), len(newestBundle))
		delete(historyBundles, newestBundle[0].ProfileId) //so that we have to try and replace it.
		orderedHistory = append(orderedHistory, newestBundle...)
		log.Printf("organizeHistory: ordered history for %s now has %d entries, completed in %.2f", tl.profileId, len(orderedHistory), time.Since(start).Seconds())
	}
	tl.history = orderedHistory
}

func getHistoryTlGraphNodesToNextPost(node *TlGraphNode) []*TlGraphNode {
	sendback := []*TlGraphNode{node}
	if node.previousNode == nil || node.Post != nil {
		return sendback
	}
	return append(sendback, getHistoryTlGraphNodesToNextPost(node.previousNode)...)
}
func sortReplies(nodes []*TlGraphNode) {
	for _, gn := range nodes {
		if gn.replies == nil || len(gn.replies) == 0 { continue }
		sort.SliceStable(gn.replies, func(a, b int) bool {
			return time.Time(gn.replies[b].Post.Date).After(time.Time(gn.replies[a].Post.Date))
		})
	}
}

func (tl *Timeline) insertReplies(nodesByCid map[string]*TlGraphNode, followeeGraphNodeHistory []*TlGraphNode) {
	//go through these graphnodes of the followee and for anything where they replied to one of our posts, insert the reply.
	for _, foloweeGn := range followeeGraphNodeHistory {
		if foloweeGn.Post == nil || foloweeGn.Post.Reply == nil { continue }

		//this bit probably needs to be figured out a bit better. when a post has multiple reply-to, which one node should it be nested under? for the moment, I'm just going to blindly put it into the one referenced by the last item on the list.
		//i think i would like to be able to verify that the other ones are the direct ancestors.
		//for now, just stick it under the last cid on the list.
		nestUnderCid := foloweeGn.Post.Reply[len(foloweeGn.Post.Reply)-1]
		log.Printf("should put a reply from %s with text '%s' underneath node with cid '%s'", foloweeGn.profile.DisplayName, foloweeGn.PreviewText, nestUnderCid)
		if repliedToGn, found := nodesByCid[nestUnderCid]; found {
			repliedToGn.replies = append(repliedToGn.replies, foloweeGn)
		}

		//for _, replyToCid := range foloweeGn.Post.Reply {
		//	if repliedToGn, found := nodesByCid[replyToCid]; found {
		//		repliedToGn.replies = append(repliedToGn.replies, foloweeGn)
		//	}
		//}
	}

}

func (tl *Timeline) extractFollowsProfileCids(history []*TlGraphNode) []string {
	follows := []string{}
	for _, e := range history {
		if e.PublicFollow == nil {
			continue
		}
		for _, followCid := range e.PublicFollow {
			follows = append(follows, followCid)
		}
	}
	return follows
}

func (tl *Timeline) fetchGraphNodeHistory(profile *TLProfile) ([]*TlGraphNode, error) {
	start := time.Now()

	var graphNodeHistory []*TlGraphNode
	currentCid := profile.GraphTip
	log.Printf("trace history for %s, starting with tip cid %s", profile.DisplayName, currentCid)
	var lastIterTlGraphNode *TlGraphNode = nil
	_ = lastIterTlGraphNode
	for {
		log.Printf("history for %s, fetching graphnode with cid %s", profile.Id, currentCid)
		currentGraphNode, err := tl.fetchGraphNodeFromIPFS(currentCid)
		if err != nil {
			log.Printf("error getting cid for graphnode: %s", err.Error())
			return nil, err
		}

		validSig := tl.checkGraphNodeSignature(currentGraphNode, profile.pubkey)
		if !validSig {
			return nil, errors.New("invalid signature")
		}

		tlGraphNode := &TlGraphNode{
			GraphNode: currentGraphNode,
			profile: profile,
			cid: currentCid,
		}
		if currentGraphNode.Post != nil {
			tlGraphNode.PreviewText, err = tl.createPostPreview(currentGraphNode.Post)
		}
		if lastIterTlGraphNode != nil {
			lastIterTlGraphNode.previousNode = tlGraphNode
		}
		graphNodeHistory = append(graphNodeHistory, tlGraphNode)
		log.Printf("length of history after adding this entry: %d", len(graphNodeHistory))

		if currentGraphNode.Previous == nil {
			log.Println("no further history. all appends made")
			break
		}
		currentCid = *currentGraphNode.Previous
		lastIterTlGraphNode = tlGraphNode
	}
	log.Printf("returning list of %d history entries for this profile after %.2fsec", len(graphNodeHistory), time.Since(start).Seconds())
	return graphNodeHistory, nil
}

func (tl *Timeline) fetchProfileHistory(profile *TLProfile) ([]*TLProfile, error) {
	start := time.Now()

	var profileHistory []*TLProfile
	currentCid := profile.cid
	log.Printf("trace profilehistory for %s, starting with tip cid %s", profile.DisplayName, currentCid)
	var lastIterTlProfileNode *TLProfile = nil
	for {
		log.Printf("profilehistory for %s, fetching profile with cid %s", profile.Id, currentCid)

		currentProfileNode, err := tl.fetchCheckProfile(profile.Id, &currentCid)
		if err != nil {
			log.Printf("error getting for profile cid %s: %s", err.Error(), currentCid)
			return nil, err
		}
		if lastIterTlProfileNode != nil {
			lastIterTlProfileNode.previousProfileNode = currentProfileNode
		}
		profileHistory = append(profileHistory, currentProfileNode)
		log.Printf("length of profilehistory after adding this entry: %d", len(profileHistory))

		if currentProfileNode.Previous == nil {
			log.Println("no further profile history. all appends made")
			break
		}
		currentCid = *currentProfileNode.Previous
		lastIterTlProfileNode = currentProfileNode
	}
	log.Printf("returning list of %d profilehistory entries for this profile after %.2fsec", len(profileHistory), time.Since(start).Seconds())
	return profileHistory, nil
}

type HistoryMessage struct {
	*GraphNode
	Cid string
	Indent int
	DisplayName string
	Date JSONTime
	PreviewText string
}
func (tl  *Timeline) generateTimeline() []*HistoryMessage {
	entriesOfInterest := []*HistoryMessage{}
	for _, e := range tl.History() {
		if e.Post != nil && e.Post.Reply == nil {
			entriesOfInterest = append(entriesOfInterest, &HistoryMessage{
				GraphNode:   e.GraphNode,
				Cid:         e.cid,
				Indent:      0,
				DisplayName: e.profile.DisplayName,
				Date:        e.Post.Date,
				PreviewText: e.PreviewText,
			})
			//timelineStrs = append(timelineStrs, fmt.Sprintf("%s: %s", e.profile.DisplayName, e.PreviewText))
			if e.replies != nil {
				//log.Printf("generateTimeline: add replies under Post thing by %s", e.profile.DisplayName)
				entriesOfInterest = append(entriesOfInterest, getReplyNodes(e, 1)...)
			}
		}
		if e.PublicFollow != nil {
			for _, pfProfileId := range e.PublicFollow {
				//do i care about follows done by people that are not me? at the moment lets say no
				//also, there is a real chance that someone i follow goes and follows someone i dont, in which case i wont have the display info unless we collect info about followees of followees etc
				if e.ProfileId != tl.profileId { continue }

				followeeProfile, found := tl.profile.follows[pfProfileId]
				if !found || followeeProfile == nil {
					log.Printf("generateTimeline: no profile info available for followee %s", pfProfileId)
					followeeProfile = &TLProfile{
						Profile: &Profile {
							DisplayName: "profileId " + pfProfileId, //coz that is all the info we have at this point.
						},
					}
					//continue
				}

				followDate := JSONTime{} //by design i'm not timestamping things that are not posts. that may be a mistake
				if e.GraphNode.Post != nil {
					//if it comes along with a post though, we should be able to put a date on it.
					followDate = e.GraphNode.Post.Date
				}

				previewText := "Follow of " + followeeProfile.DisplayName
				entriesOfInterest = append(entriesOfInterest, &HistoryMessage{
					GraphNode:   e.GraphNode,
					Cid:         e.cid,
					Indent:      0,
					DisplayName: e.profile.DisplayName,
					Date:        followDate,
					PreviewText: previewText,
				})
			}
		}
	}
	return entriesOfInterest
}
func getReplyNodes(node *TlGraphNode, depth int) []*HistoryMessage {
	indent := depth
	if depth > 3 {
		return []*HistoryMessage{{
			Indent: depth,
		}}
	}
	lines := []*HistoryMessage{}
	//log.Printf("at depth %d node cid %s has replies like: %#v", depth, node.cid, node.replies)
	for _, replyGn := range node.replies {
		lines = append(lines, &HistoryMessage{
			GraphNode:   replyGn.GraphNode,
			Cid:         replyGn.cid,
			Indent:      indent,
			DisplayName: replyGn.profile.DisplayName,
			Date:        replyGn.Post.Date,
			PreviewText: replyGn.PreviewText,
		})
		//fmt.Sprintf("%s%s: %s", indent, replyGn.profile.DisplayName, replyGn.PreviewText)
		//log.Printf("at depth %d lines shaping up like %#v", depth, lines)
		if replyGn.replies != nil {
			//log.Printf("going deeper ...")
			lines = append(lines, getReplyNodes(replyGn, depth+1)...)
		}
	}
	return lines
}

func  (tl *Timeline) generateTextTimeline() []string {
	timelineStrs := []string{}
	for _, historyMessage := range tl.generateTimeline() {
		indent := strings.Repeat("\t", historyMessage.Indent)
		timelineStrs = append(timelineStrs, fmt.Sprintf("%s%s: %s", indent, historyMessage.DisplayName, historyMessage.PreviewText))
	}

	return timelineStrs
}

func (tl *Timeline) History() []*TlGraphNode {
	return tl.history
}

func (tl *Timeline) createPostPreview(post *Post) (string, error) {
	postText := ""
	if post.MimeType == "text/plain" {
		postTextBytes, err := tl.ipfs.getCidFileBytes(post.Cid)
		if err != nil {
			return "", err
		}
		postText = string(postTextBytes)
		//log.Printf("postText: %#v", postText)
	} else {
		postText = fmt.Sprintf("(no preview for %s type)", post.MimeType)
	}
	//datestr := time.Time(post.Date).Format(time.RFC3339)
	//return datestr + " " + postText, nil
	return postText, nil
}


func (tl *Timeline) fetchGraphNodeFromIPFS(cid string) (*GraphNode, error){
	graphNodeBytes, err := IPFS.getCidFileBytes(cid)
	if err != nil {
		return nil, err
	}
	graphNode := &GraphNode{}
	err = json.Unmarshal(graphNodeBytes, graphNode)
	if err != nil {
		return nil, err
	}
	//log.Printf("%#v", graphNode)
	return graphNode, nil
}

func  (tl *Timeline) checkGraphNodeSignature(graphnode *GraphNode, pubkey *rsa.PublicKey) bool {
	// set signature to blank
	signature := graphnode.Signature
	graphnode.Signature = nil
	serializedGraphNode, err := json.Marshal(graphnode)
	checkError(err)
	graphnode.Signature = signature
	serializedGraphNodeHash := tl.crypter.makeMsgHashSum(serializedGraphNode)
	err = rsa.VerifyPSS(pubkey, crypto.SHA256, serializedGraphNodeHash, signature, nil)
	if err != nil {
		fmt.Println("could not verify signature: ", err)
		return false
	}
	return true
}

func  (tl *Timeline) signProfile(profile *Profile, privkey *rsa.PrivateKey) {
	profile.Signature = nil
	serializedProfile, err := json.Marshal(profile)
	checkError(err)
	serializedProfileHash := tl.crypter.makeMsgHashSum(serializedProfile)
	profile.Signature = tl.crypter.makeSig(privkey, serializedProfileHash)
	log.Printf("length of signature: %d", len(profile.Signature))
	return
}

func (tl *Timeline)  checkProfileSignature(profile *Profile, pubkey *rsa.PublicKey) (bool, error) {
	signature := profile.Signature
	profile.Signature = nil
	serializedProfile, err := json.Marshal(profile)
	profile.Signature = signature //put it back so that we dont wreck the data structure.
	if err != nil {
		fmt.Println("could not verify signature: ", err)
		return false, err
	}
	serializedProfileHash := tl.crypter.makeMsgHashSum(serializedProfile)
	err = rsa.VerifyPSS(pubkey, crypto.SHA256, serializedProfileHash, signature, nil)
	if err != nil {
		return false, err
	}
	return true, nil
}


func (tl *Timeline)  createSignedProfile(key *rsa.PrivateKey, displayName, bio, tip string, prev *string) *Profile {
	pubKeyBytes, pubKeyHash := tl.calculateProfileId(&key.PublicKey)
	profile := Profile{
		Id:          pubKeyHash,
		Pubkey:      pubKeyBytes,
		DisplayName: displayName,
		Bio:         bio,
		GraphTip:    tip,
		Previous:    prev,
	}
	tl.signProfile(&profile, key)
	return &profile
}

//func (tl *Timeline)  createSignedGraphNode(key *rsa.PrivateKey, post *Post, prev *string, follows []string) *GraphNode {
//	panic("deprecated. use GraphNode.Sign()")
//	_, profileId := tl.calculateProfileId(&key.PublicKey)
//	graphnode := GraphNode{
//		Version:      1,
//		Previous:     prev,
//		ProfileId:    profileId,
//		Post:         post,
//		PublicFollow: follows,
//	}
//	//tl.signGraphNode(&graphnode, key)
//	return &graphnode
//}

func (tl *Timeline)  calculateProfileId(pubkey *rsa.PublicKey) ([]byte, string) {
	pubKeyBytes := x509.MarshalPKCS1PublicKey(pubkey)
	//pubKeyHash := makeMsgHashSum(pubKeyBytes)
	pubKeyHash := tl.crypter.getPeerIDBase58FromPubkey(pubkey)
	return pubKeyBytes, pubKeyHash
}

func (tl *Timeline)  addStringToIPFS(text string) string {
	return tl.ipfs.addContentToIPFS([]byte(text))
}

func  (tl *Timeline) makeTextPost(text string) *Post {
	cid := tl.ipfs.addContentToIPFS([]byte(text))
	return &Post{
		MimeType: "text/plain",
		Cid: cid,
		Date: tl.timeService.GetTime(),
	}
}

func (tl *Timeline)  publishGraphNodeToIPFS(node *GraphNode) (string, error) {
	nodebytes, err := json.Marshal(node)
	if err != nil { return "", err }
	return tl.ipfs.addContentToIPFS(nodebytes), nil
}

func (tl *Timeline)  publishProfileToIPFS(profile *Profile) string {
	pfoilebytes, err := json.Marshal(profile)
	checkError(err)
	return tl.ipfs.addContentToIPFS(pfoilebytes)
}
