package main

import (
	"crypto/rsa"
	"encoding/json"
	"github.com/ReneKroon/ttlcache"
	"log"
	//"context"
	//"crypto/rsa"
	//"crypto/x509"
	"fmt"
	//shell "github.com/ipfs/go-ipfs-api"
	//"log"
	"time"
)

type GraphNode struct {
	Version int `json:"ver"`
	Previous *string `json:"previous"`
	//Profile rsa.PublicKey `json:"profile"`
	//ProfileId []byte `json:"profile"` //hash of profiles pubkey
	ProfileId string //also the IPNS name for this profile, were it to be published there.
	//// OOOOR maybe the profileid should be the ipns name ?? that is also a effectively a hash of the pubkey, and why not just use it then it is a universal key which could resolve via ipns or other means.
	Post *Post `json:"post,omitempty"`

	RetractionOfNodeCid *string `json: "retraction,omitempty"`
	RepostOfNodeCid *string `json: "repost,omitempty"`

	PublicFollow []string `json:"publicfollow,omitempty"`
	PublicUnfollow []string `json:"publicufollow,omitempty"`
	PublicLike []string `json:"publiclike,omitempty"`
	PublicUnlike []string `json:"publicunlike,omitempty"`

	Signature []byte
	// maybe the date belongs up in here
	// also anyone could just lie about the date so maybe
	// the concept of timestamp oracles could be used somehow
	// oracle would need to certify the time it saw the post
	// could put cids of oracle sigs, those would just look like post hash, timestamp and signature.
}
func (gn *GraphNode) SetPrevious(previous string) *GraphNode {
	gn.Previous = &previous
	return gn
}
func (gn *GraphNode) AddPost(post *Post) *GraphNode {
	gn.Post = post
	return gn
}
func (gn *GraphNode) SetAsReplyTo(replyTo []string) *GraphNode {
	gn.Post.Reply = replyTo
	return gn
}
func (gn *GraphNode) SetAsRepostOf(repostOfCid string) *GraphNode {
	gn.RepostOfNodeCid = &repostOfCid
	return gn
}
func (gn *GraphNode) AddPublicFollow(publicFollow []string) *GraphNode  {
	gn.PublicFollow = publicFollow
	return gn
}
func (gn *GraphNode) AddPublicUnfollow(publicUnfollow []string) *GraphNode  {
	gn.PublicUnfollow = publicUnfollow
	return gn
}

func (gn *GraphNode) AddRetraction(graphNodeCid string) *GraphNode  {
	gn.RetractionOfNodeCid = &graphNodeCid
	return gn
}

func (gn *GraphNode) Sign(privkey *rsa.PrivateKey, crypter HasherSigner) *GraphNode {
	serializedGraphNode, err := json.Marshal(gn)
	checkError(err)
	serializedGraphNodeHash := crypter.makeMsgHashSum(serializedGraphNode)

	//we hashed it without the signature obviously but now we are going to put the signature in
	gn.Signature = crypter.makeSig(privkey, serializedGraphNodeHash)
	return gn
}

type HasherSigner interface {
	makeMsgHashSum(msg []byte) []byte
	makeSig(key *rsa.PrivateKey, msgHashSum []byte) []byte
}

type Post struct {
	MimeType string
	Cid string
	Date JSONTime
	Reply []string
}

type Profile struct {
	//Id []byte //a sha256 hash of the output of x509.MarshalPKCS1PublicKey(&keyReadback.PublicKey), see Test_use_binary_rsa_key_from_ipfs
	Id string //a sha256 hash of the output of marshalled ipfs pubkey protobuf, converted to base58, aka the IPNS name
	Pubkey []byte //output of x509.MarshalPKCS1PublicKey(&keyReadback.PublicKey), so ppl should be able to use this to verify signatures as well as encrypt private messages
	//IPNS string // ipns address where this profile could be found UPDATE now I know this can be derived from the pubkey, and how to do so, it does not need to be stored as well.
	GraphTip string // cid of the tip GraphNode of this profiles publicly available social graph. Clients would start here and spider back through previous nodes.
	//Socials map[string]string // suggested keys would be things like twitter, facebook, minds, etc. with links to the profiles
	DisplayName string
	Bio string
	Previous *string //cid of previous version of the profile.
	Signature []byte
	IPNSDelegate *string `json:",omitempty"`
}

type JSONTime time.Time
func (t *JSONTime)MarshalJSON() ([]byte, error) {
	//do your serializing here
	ts := time.Time(*t).Format(time.RFC3339)
	stamp := fmt.Sprint(ts)
	return []byte(`"` + stamp + `"`), nil
}
func (t *JSONTime)UnmarshalJSON(data []byte) error {
	t1, err := time.Parse(
		time.RFC3339,
		string(data[1 : len(data)-1]), //lose the quotes first.
	)
	if err != nil {
		return err
	}
	*t = JSONTime(t1)
	return nil
}

type Trashcan struct {
	garbagePile *ttlcache.Cache
}
func  (g *Trashcan) prepareDumpsterToReceiveTrash() {
	g.garbagePile = ttlcache.NewCache()
	g.garbagePile.SetTTL(24 * time.Hour)
}
func (g *Trashcan) isIt(cid string) bool {
	if _, exists := g.garbagePile.Get(cid); exists == true {
		log.Printf("isIt? believes %s TO BE TRASH", cid)
		return true
	}
	return false
}
func (g *Trashcan) throwItIn(cid string) {
	log.Printf("throwItIn the trash: %s", cid)
	g.garbagePile.Set(cid, true)
}