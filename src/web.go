package main

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"github.com/gorilla/mux"
	"github.com/rs/cors"
	"log"
	"sync"
	"time"

	//ipns "github.com/ipfs/go-ipns"
	//"log"
	"net/http"
)
type APIService struct {
	TimeService TimeService
	WlProfileIds map[string]bool
	BaseWlProfileIds map[string]bool
	WlProfileIdMutex sync.RWMutex
}
//var WlProfileIds = map[string]bool{}
//var WlProfileIdMutex = sync.RWMutex{}
func (s *APIService) Start(servicePort string) {
	c := cors.New(cors.Options{
		AllowedOrigins: []string{"*"}, // All origins
		AllowedMethods: []string{"GET","POST"},
	})

	router := mux.NewRouter()

	router.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./web/index.html")
	})

	router.HandleFunc("/unsignedGraphNodeForPost", s.unsignedGraphNodeForPost).Methods("POST")
	router.HandleFunc("/unsignedProfileWithFirstPost", s.unsignedProfileWithFirstPost).Methods("POST")
	router.HandleFunc("/publishedProfileCid", s.publishedProfileCid).Methods("POST")
	router.HandleFunc("/IPNSDelegateName", s.IPNSDelegateName).Methods("GET")
	router.HandleFunc("/history", s.history).Methods("POST")

	//TODO fix this stuff below maybe can be one function to get the two files ??? maybe i can drop localforage into the one file.
	router.HandleFunc("/peerId", s.peerId).Methods("GET")

	// some middleware to auth by pubkey
	router.Use(s.WlProfileIdViaPubkeyHeaderAuthMiddleware)

	err := http.ListenAndServe(":"+servicePort,  c.Handler(router))
	if err != nil {
		panic(err)
	}
}
func (s *APIService) setupWl(list []string) {
	start := time.Now()
	wg := sync.WaitGroup{}
	added := map[string]int64{}
	for _, profileId := range list {
		s.WlProfileIdMutex.Lock()
		s.WlProfileIds[profileId] = true
		s.BaseWlProfileIds[profileId] = true
		added[profileId]++
		s.WlProfileIdMutex.Unlock()

		log.Printf("setupWl adding %s, going to see the followee profileIds", profileId)
		wg.Add(1)
		go func(profileId string) {
			historyWls := s.getHistoryFollows(profileId)
			for _, followeePprofileId := range historyWls {
				s.WlProfileIdMutex.Lock()
				s.WlProfileIds[followeePprofileId] = true
				added[profileId]++
				s.WlProfileIdMutex.Unlock()
			}
			wg.Done()
		}(profileId)
	}
	wg.Wait()

	total := int64(0)
	s.WlProfileIdMutex.Lock()
	for profileId, count := range added {
		log.Printf("setupWl added %d entries on behalf of profileId %s", count, profileId)
		total += count
	}
	s.WlProfileIdMutex.Unlock()
	log.Printf("setupWl added total of %d profileIds to the wl", total)
	log.Printf("setupWl: finished after %.2f sec", time.Since(start).Seconds())
}
func (s *APIService) getHistoryFollows(profileId string) []string {
	tl := &Timeline{
		crypter: Crypter,
		ipfs: IPFS,
		profileId: profileId,
	}
	err := tl.LoadProfile()
	if err != nil {
		log.Printf("getHistoryFollows loadProfile error: %s", err.Error())
		return nil
	}
	profileHistory, err := tl.fetchProfileHistory(tl.profile)
	if err != nil {
		log.Printf("getHistoryFollows fetchProfileHistory error: %s", err.Error())
		return nil
	}
	return tl.extractFollowsProfileCids(profileHistory)
}

func (s *APIService) WlProfileIdViaPubkeyHeaderAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%#v", r.URL)
		if r.URL != nil {
			if r.URL.Path == "/" || r.URL.Path == "/peerId" {
				//custom cheesy hax to avoid doing subrouter stuff to allow one path to be excluded from this auth.
				next.ServeHTTP(w, r)
				return
			}
		}

		profileId, onWl := s.checkHeaderForPubkeyOnWl(r.Header.Get("X-Pubkey-B64"))
		if !onWl {
			log.Printf("FORBIDDEN Profileid '%s' not on wl.", profileId)
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		log.Printf("Authenticated profileId %s\n", profileId)
		// Pass down the request to the next middleware (or final handler)
		next.ServeHTTP(w, r)
	})
}
func (s *APIService) checkHeaderForPubkeyOnWl(pubkeyB64 string) (string, bool){
	if pubkeyB64 == "" {
		return "", false
	}
	pubkey, err := getRSAPubkeyFromB64(pubkeyB64)
	if err != nil {
		return "", false
	}
	profileId := Crypter.getPeerIDBase58FromPubkey(pubkey)
	s.WlProfileIdMutex.RLock()
	defer s.WlProfileIdMutex.RUnlock()
	if _, found := s.WlProfileIds[profileId]; !found {
		return profileId, false
	}
	log.Printf("checkHeaderForPubkeyOnWl: %s is on the list.", profileId)
	return profileId, true
}


type CreateProfileJsonArgs struct {
	Pubkey string `json: "pubkey"`
	Text *string `json: "text,omitempty"`
	Previous *string `json: "previous,omitempty"`
	InReplyTo *string `json: "inreplyto,omitempty"`
	FollowProfileId *string `json: "followprofileid,omitempty"`
}
func (s *APIService) unsignedGraphNodeForPost(w http.ResponseWriter, r *http.Request) {
	//bodyall, err := ioutil.ReadAll(r.Body)
	//log.Printf("entire contents of post body: '%s'", bodyall)
	//log.Printf("content len of body: '%d'", r.ContentLength)
	//return
	log.Printf("method 1 start")
	args := &CreateProfileJsonArgs{}
	err := json.NewDecoder(r.Body).Decode(&args)
	_ = err
	if err != nil {
		log.Println("decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	log.Printf("%#v", args)

	pubkey, err := getRSAPubkeyFromB64(args.Pubkey)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	graphNode := &GraphNode{
		Version: 1,
		ProfileId: Crypter.getPeerIDBase58FromPubkey(pubkey),
		//Post: firstPost,
		Previous: args.Previous,
	}

	if args.Text != nil && *args.Text != "" {
		firstPostCid := IPFS.addContentToIPFS([]byte(*args.Text))
		firstPost := &Post{
			MimeType: "text/plain",
			Cid:      firstPostCid,
			Date:     s.TimeService.GetTime(),
		}
		if args.InReplyTo != nil && *args.InReplyTo != "" {
			firstPost.Reply = []string{*args.InReplyTo} //just one for now this way, multireply later.
		}
		graphNode.Post = firstPost
	}
	if args.FollowProfileId != nil && *args.FollowProfileId != "" {
		graphNode.PublicFollow = []string{*args.FollowProfileId} //just one for now this way for follows as well.
	}
	serializedGraphNode, err := json.Marshal(graphNode)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	log.Printf("method 1 finished well")
	w.WriteHeader(http.StatusOK)
	w.Write(serializedGraphNode)
	//fmt.Fprintf(w, "Category: %v\n", vars["category"])
}

func getRSAPubkeyFromB64(b64 string) (*rsa.PublicKey, error){
	decoded, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		log.Println("decode error:", err)
		return nil, err
	}
	pubkeyInterface, err := x509.ParsePKIXPublicKey(decoded)
	if err != nil {
		return nil, err
	}
	pubkey := pubkeyInterface.(*rsa.PublicKey)
	return pubkey, nil
}
func getRSAPrivatekeyFromB64(b64 string) (*rsa.PrivateKey, error){
	decoded, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		log.Println("decode error:", err)
		return nil, err
	}
	privkeyInterface, err := x509.ParsePKCS8PrivateKey(decoded)
	if err != nil {
		return nil, err
	}
	privkey := privkeyInterface.(*rsa.PrivateKey)
	return privkey, nil
}

type CreateProfileStep2JsonArgs struct {
	Pubkey string `json: "pubkey"`
	UnsignedGraphNodeJson string `json: "unsignedGraphNodeJson"`
	Signatureb64 string `json: "signatureb64"`
	DisplayName string  `json: "displayname"`
	Bio string  `json: "bio"`
	Previous *string  `json: "previous,omitempty"`
	UseIPNSDelegate  bool  `json: "useipnsdelegate,omitempty"`
}
func (s *APIService) unsignedProfileWithFirstPost(w http.ResponseWriter, r *http.Request) {
	var err error

	//bodyall, err := ioutil.ReadAll(r.Body)
	//log.Printf("entire contents of post body: '%s'", bodyall)
	//log.Printf("content len of body: '%d'", r.ContentLength)
	//return
	//
	log.Printf("method 2 start")
	args := &CreateProfileStep2JsonArgs{}
	log.Printf("here0")
	err = json.NewDecoder(r.Body).Decode(&args)
	log.Printf("here1")
	_ = err
	if err != nil {
		log.Println("decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	log.Printf("%#v", args)

	pubkey, err := getRSAPubkeyFromB64(args.Pubkey)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	graphNode := &GraphNode{}
	err = json.Unmarshal([]byte(args.UnsignedGraphNodeJson), graphNode)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	sigDecoded, err := base64.StdEncoding.DecodeString(args.Signatureb64)
	if err != nil {
		log.Println("decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	graphNode.Signature = sigDecoded
	log.Printf("%#v", graphNode)

	fakeTl := &Timeline{ //just for util funcs ... maybe they dont belong where they are
		crypter: Crypter,
		ipfs: IPFS,
	}
	validSig := fakeTl.checkGraphNodeSignature(graphNode, pubkey)
	if validSig != true {
		log.Printf("invalid signature :(")
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	graphNodeCid, err := fakeTl.publishGraphNodeToIPFS(graphNode)
	if err != nil {
		log.Println("publish graphnode to ipfs err:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	//if the person doing some following is on the base wl (check with lock), put the followee people into the live wl.
	if graphNode.PublicFollow != nil {
		s.WlProfileIdMutex.Lock()
		if _, found := s.BaseWlProfileIds[graphNode.ProfileId]; found {
			for _, followProfileId := range graphNode.PublicFollow {
				s.WlProfileIds[followProfileId] = true
			}
			log.Printf("Added new follow by baseWl profile id %s of followee profile id %s to the live profile wl", graphNode.ProfileId, graphNode.ProfileId)
		}
		s.WlProfileIdMutex.Unlock()
	}

	pubKeyBytes, pubKeyHash := fakeTl.calculateProfileId(pubkey)
	profile := Profile{
		Id:      pubKeyHash,
		Pubkey:  pubKeyBytes,
		DisplayName: args.DisplayName,
		Bio:     args.Bio,
		Tip:     graphNodeCid,
		Previous: args.Previous,
	}
	if args.UseIPNSDelegate == true {
		profile.IPNSDelegate = fakeTl.ipfs.getIPNSDelegateName()
	}

	serializedUnsignedProfile, err := json.Marshal(profile)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	log.Printf("method 2 finish well")
	log.Printf("wheeeeeeee whats next?")
	w.WriteHeader(http.StatusOK)
	w.Write(serializedUnsignedProfile)
	//fmt.Fprintf(w, "Category: %v\n", vars["category"])
}

type CreateProfileStep3JsonArgs struct {
	Pubkey string `json: "pubkey"`
	Privkey string `json: "privkey,omitempty"`
	UnsignedProfileJson string `json: "unsignedProfileJson"`
	Signatureb64 string `json: "signatureb64"`
}
func (s *APIService) publishedProfileCid(w http.ResponseWriter, r *http.Request) {
	var err error
	log.Printf("method 3 start")
	args := &CreateProfileStep3JsonArgs{}
	log.Printf("here0")
	err = json.NewDecoder(r.Body).Decode(&args)
	log.Printf("here1")
	_ = err
	if err != nil {
		log.Println("decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	log.Printf("%#v", args)

	pubkey, err := getRSAPubkeyFromB64(args.Pubkey)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	profile := &Profile{}
	err = json.Unmarshal([]byte(args.UnsignedProfileJson), profile)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	sigDecoded, err := base64.StdEncoding.DecodeString(args.Signatureb64)
	if err != nil {
		log.Println("decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	profile.Signature = sigDecoded
	log.Printf("%#v", profile)

	fakeTl := &Timeline{ //just for util funcs ... maybe they dont belong where they are
		crypter: Crypter,
		ipfs: IPFS,
	}
	validSig, err := fakeTl.checkProfileSignature(profile, pubkey)
	//tODO why does the other checkNNNSig only return a bool and not a error too? also that check below is gross.
	if err != nil || !validSig {
		log.Printf("invalid signature :(")
		log.Print(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	profileCid := fakeTl.publishProfileToIPFS(profile) //TODO this should also return an err like the other publish

	fakeTl.ipfs.updateCacheEntry(profile, profileCid)
	if profile.IPNSDelegate != nil {
		//fakeTl.publishDelegatedIPNSUpdate(profile, profileCid)
		fakeTl.ipfs.updateDelegateEntry(profile, profileCid)
	} else {
		log.Printf("not doing updateDelegateEntry, maybe we can do ipns stuff? do we have the key?")
		privkey, err := getRSAPrivatekeyFromB64(args.Privkey)
		if err != nil {
			log.Printf("rsa privkey extract err")
			log.Print(err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		Crypter.writeBinaryIPFSRsaKey(privkey, Crypter.keystorePath +  profile.Id)
		fakeTl.ipfs.updateNonDelegateEntry(profile, profileCid)
		//fakeTl.ipfs.addPrivKeyIPNSPublish(privkey, profile.Id, profileCid)
	}


	//if err != nil {
	//	log.Println("publish graphnode to ipfs err:", err)
	//	w.WriteHeader(http.StatusInternalServerError)
	//	return
	//}


	log.Printf("method 3 finish well")
	log.Printf("so ... now profile is published to %s... no ipns for it tho.", profileCid)
	log.Printf("lol maybe we can get the browser to sign ipns entry too hahaha. i'm sure it would be possible but delegating it will be a lot faster to figure out.")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(profileCid))
	//fmt.Fprintf(w, "Category: %v\n", vars["category"])
}
func (s *APIService) IPNSDelegateName(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	ipfsName := IPFS.getIPNSDelegateName()
	if ipfsName == nil {
		w.Write([]byte("Not available"))
		return
	}
	w.Write([]byte(*ipfsName))
}
func (s *APIService) peerId(w http.ResponseWriter, r *http.Request) {
	//seems silly to be doing this as a server method doesnt it? you would think, hey this should be easy in the browser, after all that is where the pubkey is coming from ...
	// well you would be wrong.
	// please, please somebody demonstrate to me with as little javascript code and external support libraries as possible how to take the base64 pubkey der encoded asn.1 bullshit and actually get the bytes of the pubkey out to feed them through multihash and base58
	// i have yet to be able to put it together in the browser and spent too much time already trying. soooo we get this grossness here instead for now.
	// some leads in the JS universe ...
		// multihashing (https://github.com/multiformats/js-multihashing) minfied, https://unpkg.com/multihashing@0.3.3/dist/index.min.js -- seemed to work properly, the output started with the right two bytes but my input was improper
		// https://github.com/cryptocoinjs/bs58 base58, output looked right, started with Qm when fed in with sha256 multihash output -- doing `browserify -r bs58 | uglifyjs > bundle.js` and putting the bundle in <script> let me 'require('bs58')
		// lead on an asn.1/der lib that might work for this: https://pkijs.org/ ... what i have not tried yet is taking a PEM style formatted output from pubkey and working with this lib to get the pubkey raw bytes out to feed them into multihash

	pubkeyB64 := r.Header.Get("X-Pubkey-B64")
	if pubkeyB64 == "" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	pubkey, err := getRSAPubkeyFromB64(pubkeyB64)
	if err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	profileId := Crypter.getPeerIDBase58FromPubkey(pubkey)
	if profileId == "" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(profileId))
}

type GetHistoryArgs struct {
	Pubkey string `json: "pubkey"`
	ProfileTip string `json:"profiletip"`
}
func (s *APIService) history(w http.ResponseWriter, r *http.Request) {
	args := &GetHistoryArgs{}
	err := json.NewDecoder(r.Body).Decode(&args)
	if err != nil {
		log.Println("decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	pubkey, err := getRSAPubkeyFromB64(args.Pubkey)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	fakeTl := &Timeline{ //just for util funcs ... maybe they dont belong where they are
		crypter:   Crypter,
		ipfs:      IPFS,
		profileId: Crypter.getPeerIDBase58FromPubkey(pubkey),
	}
	fakeTl.profile, err = fakeTl.fetchCheckProfile(fakeTl.profileId, &args.ProfileTip)
	log.Printf("fakeTl.profile: %#v", fakeTl.profile.follows)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	err = fakeTl.LoadHistory()
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	tlLinesJson, err := json.Marshal(fakeTl.generateTimeline())
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	w.Write(tlLinesJson)
}