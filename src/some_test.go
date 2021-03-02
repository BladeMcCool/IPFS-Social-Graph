package main

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"io/ioutil"
	"log"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/cheekybits/is"
	shell "github.com/ipfs/go-ipfs-api"
	//mh "github.com/multiformats/go-multihash"
	//b58 "github.com/mr-tron/base58/base58"
)

var commonHardcodeTestKey *rsa.PrivateKey
var commonHardcodeProfileId = "QmabPmcVwPYnEAeTmh7rTJ55QifqRo3fADRFtSSFrK9Yfw"
var commonIpfsTestKey *rsa.PrivateKey
var commonIpfsKeyProfileId = "" //determined below. this key will change from install to install.
var commonIpfsKeyProfileIdb36IPNSName = "" //determined below. this key will change from install to install.

func init() {
	var err error
	prikeyB64 := `MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCSeO6s8AvMX+oXezQg2HMXVtNzucEXY3s2iJZyVoAtg7v/MfR8rynizNSQjYzjxTAXnwVVHlPqdHBOOKgWFdOrI3DsqMJzE7SaHMBSxMniBtnkj3rB6Tabj46j5WivLLso/e81cBNDeDT5HoF22aMIdRnB+2+JbRuVio7odJL/N7/PS7kqy4pbuds/Y3qUoUf39esrEO8r+ckD+TsriZ7IabiNmieuzXVMskFL4JNWYCy+GVjfe4ZKaXH39Hzq6I+9CcZxIOQ3+lcO/Eea8TNCP5x545Gsz5jn7lWTxry8vcQ1HGwefaMZM+I40aB2c1NMuEiM+lDTTrCrEHGPt9jdAgMBAAECggEAEHBMnzGgrVsNZ32/E7mfLx0iRbBxDJowY6YwNlxhbdpFUOaPISg6i/b/m0qbp5uDon8JJuysr9lKGmlO6g2gkCo92/2ztx0czZgQ+KkX3Et3DGkS9qzhIVPbBydx2IktZzQasvVlYBLfZR8omglifApCbgw1UCfj6uReVhXxQn3YiCNbbQbArQeThb4EcX533jOfc4jqlEYtbAXNPNy72hkwLaHFiaTLaRK437YILFGoGkig9Ja1awrkDqq+Wd+RHIbEOGpVjRvLIitE/p/ge7ap0UOmEFD3RARSDpff1pa22JvPryQQTpt4smt2XBEc/GqChCcZ29mglf+AWYpK2QKBgQDHQnkDOJH/HdsR6dFePozVQMf/XvdYe8R7ysAJ0SH0i1qpTcD6AUxAYCcwjRNb3LWpU6qelP6IROATCsODg7ZcJBRjQltq2zrbdjeGIGTtOW0HuHBFmlMAK7XG6ywOPcnm0LZR/MJyDBxw8B/Ty2/LOlPmLmmpaIRzYqDs7vq/uQKBgQC8LmaanGFsaXaqT9XRR1oJdYdUegr74tlvf+Mnf2Ll38ejfY86qbm6cNvZjjVU1qmVxNAw4/AnP4mGIebdam+SdtPleBqQn25jI4f0TnaNLEH7egXZks2jKy0uoC8MoKRfTusrSJvKYQFvZBAsIyc0c57H49+DXpdfvosomhGMRQKBgEoE1mEs7YcAdzWTTvQcdkJtmx2xEF7tMxLtQSMkbeGitp33xTzZqJKtZUFy1oMkXNM2wkXAgUDrnPVV5UUAc4iM2on4x27NW3LU2lFXzUYWM/tPN12Ts0t38UGgcLAloc+9Lk0MgMrO1u3ZNWl+w9uRokL6cMO+kJ0wQSliqQD5AoGBAIvHS598mUEV9Xb8Zi5VeaOdETDGlnITRr9zlx83mBZ36qqeEU3Z1IOQYT1wTF0ANmdxEdO+/BurLlPbysicztNUQIEqfVD/m9c4BTyLK7QhM8HAGahLS0PwRldj1I7kpDPHQxebj1z8QTykbv7Z/b0QRNjlgpjqIjaUKnm2N2KhAoGABuoD4423kXDcVPAE2KuAYTE8EWfWKOvDCFNxIKhT2akgtPwmcmksxHZH1bjaV8crh9fxb86VgX7AiWRY58ohZAKBXdYarOYm/hO/sZf9qXTpWB0w0GT7TbWIOfLRA/HaO64Wcr25H8kIJxnGGMi+CXO7hjbuetgxhLPdBth+c98=`
	log.Printf("Here0")
	commonHardcodeTestKey, err = getRSAPrivatekeyFromB64(prikeyB64)
	if err != nil {
		panic("failed to set up for tests")
	}
	log.Printf("Here1")
	err = IPFS.makeKeyInIPFS("test_key")
	if err != nil && err.Error() != "key/gen: key with name 'test_key' already exists" {
		panic("failed to set up for tests")
	}
	log.Printf("Here2")
	commonIpfsTestKey, err = Crypter.readBinaryIPFSRsaKey("test_key")
	if err != nil {
		panic("failed to set up for tests")
	}
	log.Printf("Here3")
	commonIpfsKeyProfileId = Crypter.getPeerIDBase58FromPubkey(&commonIpfsTestKey.PublicKey)
	commonIpfsKeyProfileIdb36IPNSName, err = Crypter.getIPNSExpectNameFromPubkey(&commonIpfsTestKey.PublicKey)
	if err != nil {
		panic("attack")
	}

	initializers()
	log.Printf("Here4")
	log.Println("test init complete")
}

func TestReplacePublishedDelegateIPNSData(t *testing.T)  {
	//Federation.mutex.Lock()
	//defer Federation.mutex.Unlock()
	old := Federation.IPNSDelegatedProfileCids
	Federation.initialized = true
	Federation.IPNSDelegatedProfileCids = map[string]string{}
	Federation.publishDelegatedIPNSUpdate()
	Federation.IPNSDelegatedProfileCids = old
}

func TestNewnamestuff (t *testing.T) {
	name, err := Crypter.getIPNSExpectNameFromPubkey(&commonIpfsTestKey.PublicKey)
	require.Nil(t, err)
	require.Equal(t, "k2k4r8nn8amgj8jmk7shlbm71f8u2e7oampdouz7bkjk70np59qklrii", name)
	log.Print(name)

	_ = IPFS.makeKeyInIPFS("ipnsdelegate2")
	name2, err := Crypter.getIPNSExpectNameFromBinaryRsaKey("ipnsdelegate2")
	require.Nil(t, err)
	require.Equal(t, len(name), len(name2))
	log.Print("name2: ", name2)

	//these will need to be updated if you run this test against a new server.
	currentServerDefaultKeyIpnsPublishName := "k2k4r8mxy2061c35it7o9m3igkqfl9qo9hk5nztrigmu3eq0apb8pva5" //discovered by trying to publish with no keyname and getting this back.
	currentServerDefaultKeyOldstylePeerId := "QmXrsXeHJFW7k4G2EcfjTruASxC6Qzfad2FwA5nXVViHWc"
	//lets see if that same value can be recovered from the config file key.
	defaultName, err := Crypter.getIPNSExpectNameFromDefaultServerConfigKey()
	require.Nil(t, err)
	defaultNameOldFormat, err := Crypter.getOldStylePeerIdFromServerConfigKey()
	require.Nil(t, err)
	assert.Equal(t, currentServerDefaultKeyIpnsPublishName, defaultName)
	assert.Equal(t, currentServerDefaultKeyOldstylePeerId, defaultNameOldFormat)
	log.Printf("default keyname for this server as pulled from config file: %s", defaultName)
	log.Printf("default keyname old format: %s", defaultNameOldFormat)
}

func Test_write_out_and_read_back_an_rsa_key__keys_match(t *testing.T) {
	fileName := "testkey"
	keyCreated := Crypter.makeKey(fileName)
	keyReadback, err := Crypter.readKey(fileName)
	require.Nil(t, err)
	_ = os.Remove(fileName)
	if !keyReadback.Equal(keyCreated) {
		t.Errorf("keys dont match??")
	}
}

func Test_signature(t *testing.T) {
	//_ = makeKey("horse")
	//keyReadback := Crypter.readKey("gooodkey")

	// Before signing, we need to hash our message
	// The hash is what we actually sign
	msg := []byte("concatenation of all the post data, done in a canonical order")
	msgHashSum := Crypter.makeMsgHashSum(msg)
	signature := Crypter.makeSig(commonHardcodeTestKey, msgHashSum)


	//verify signature now
	err := rsa.VerifyPSS(&commonHardcodeTestKey.PublicKey, crypto.SHA256, msgHashSum, signature, nil)
	require.Nil(t, err)
	if err != nil {
		fmt.Println("could not verify signature: ", err)
		t.Errorf("could not verify signature")
		return
	}
	// If we don't get any error from the `VerifyPSS` method, that means our
	// signature is valid
	fmt.Println("signature verified")
}

func Test_use_binary_rsa_key_from_ipfs(t *testing.T) {
	var err error
	//err := IPFS.makeKeyInIPFS("test_key")
	//require.Nil(t, err)
	//keyReadback := Crypter.readBinaryIPFSRsaKey("test_key")

	// Before signing, we need to hash our message
	// The hash is what we actually sign
	msg := []byte("concatenation of all the post data, done in a canonical order")
	msgHashSum := Crypter.makeMsgHashSum(msg)
	signature := Crypter.makeSig(commonIpfsTestKey, msgHashSum)

	pubkeyBytes := x509.MarshalPKCS1PublicKey(&commonIpfsTestKey.PublicKey)
	_ = pubkeyBytes


	//verify signature now
	err = rsa.VerifyPSS(&commonIpfsTestKey.PublicKey, crypto.SHA256, msgHashSum, signature, nil)
	require.Nil(t, err)
	if err != nil {
		fmt.Println("could not verify signature: ", err)
		t.Errorf("could not verify signature")
		return
	}
	// If we don't get any error from the `VerifyPSS` method, that means our
	// signature is valid
	fmt.Println("signature verified")

}

func _TestPubsub(t *testing.T) {
	//was useful when i was first starting on stuff.

	s := shell.NewShell("localhost:7767")
	kk, err := s.PubSubSubscribe("potatoes")
	if err != nil {
		log.Printf("got err when trying to subscribe: %s", err.Error())
	}
	require.Nil(t, err)
	for {
		msg, err := kk.Next()
		if err != nil {
			log.Printf("got err: %s", err.Error())
		}
		log.Printf("got msg from %s on potatoes channel: %s", msg.From, string(msg.Data))
	}
}

func _TestKeyGen(t *testing.T) {
	//was useful when i was first starting on stuff.

	is := is.New(t)
	s := shell.NewShell("localhost:7767")


	//defer func() {
	//	_, err := s.KeyRm(context.Background(), "testKey1")
	//	is.Nil(err)
	//}()
	key1, err := s.KeyGen(context.Background(), "testKey1", shell.KeyGen.Type("ed25519"))
	is.Nil(err)
	is.Equal(key1.Name, "testKey1")
	is.NotNil(key1.Id)

	//defer func() {
	//	_, err = s.KeyRm(context.Background(), "testKey2")
	//	is.Nil(err)
	//}()
	key2, err := s.KeyGen(context.Background(), "testKey2", shell.KeyGen.Type("ed25519"))
	is.Nil(err)
	is.Equal(key2.Name, "testKey2")
	is.NotNil(key2.Id)

	//defer func() {
	//	_, err = s.KeyRm(context.Background(), "testKey3")
	//	is.Nil(err)
	//}()
	key3, err := s.KeyGen(context.Background(), "testKey3", shell.KeyGen.Type("rsa"))
	is.Nil(err)
	is.Equal(key3.Name, "testKey3")
	is.NotNil(key3.Id)

	//defer func() {
	//	_, err = s.KeyRm(context.Background(), "testKey4")
	//	is.Nil(err)
	//}()
	key4, err := s.KeyGen(context.Background(), "testKey4", shell.KeyGen.Type("rsa"), shell.KeyGen.Size(4096))
	is.Nil(err)
	is.Equal(key4.Name, "testKey4")
	is.NotNil(key4.Id)

	//_, err = s.KeyGen(context.Background(), "testKey5", shell.KeyGen.Type("rsa"), shell.KeyGen.Size(1024))
	//is.NotNil(err)
	//is.Equal(err.Error(), "key/gen: rsa keys must be >= 2048 bits to be useful")
}


func TestPublishDetailsWithKey(t *testing.T) {
	//var examplesHashForIPNS = "/ipfs/Qmbu7x6gJbsKDcseQv66pSbUcAA3Au6f7MfTYVXwvBxN2K"

	//Crypter.readBinaryIPFSRsaKey("") //"testKey3" // feel free to change to whatever key you have locally
	//var testKey = Crypter.readBinaryIPFSRsaKey("test_key")
	////var expectName = "QmQFsV3XBtEoYnABnJLAey78LVx1Aexc7k3xtppVynv8RU" //seems this is the name that testKey3 will get
	//var expectName = Crypter.getPeerIDBase58FromPubkey(&testKey.PublicKey)
	//t.Skip()
	shell := shell.NewShell("localhost:7767")
	stringreader := strings.NewReader("whee i'm in ipfs now! and new data gets new hash.")
	examplesHashForIPNS, err := shell.Add(stringreader)
	if err != nil {
		t.Fatal(err)
	}

	resp, err := shell.PublishWithDetails("/ipfs/"+ examplesHashForIPNS, "test_key", time.Second * 100, time.Second * 100, false)
	if err != nil {
		t.Fatal(err)
	}

	if resp.Value != "/ipfs/" + examplesHashForIPNS {
		t.Fatalf(fmt.Sprintf("Expected to receive %s but got %s", examplesHashForIPNS, resp.Value))
	}
	//if resp.Name != commonIpfsKeyProfileId {
	if resp.Name != commonIpfsKeyProfileIdb36IPNSName {
		t.Fatalf("got something unexpected for the name :(")
	}

	// TODO: have a look at the code on this page:
	// https://stackoverflow.com/questions/51433889/is-it-possible-to-derive-an-ipns-name-from-an-ipfs-keypair-without-publishing
	// and see if we get the same value of QmQFsV3XBtEoYnABnJLAey78LVx1Aexc7k3xtppVynv8RU for that testkey3 private key
	// without having to publish first to get it.
}

func Test_get_peer_id_from_pubkey_in_different_ways(t *testing.T) {
	//first drop commonHardcodeTestKey into the filesystem for ipfs ...
	_ = os.Remove(Crypter.ipfsKeystorePath + "/" + "binary_rsa_privkey")
	err := Crypter.writeBinaryIPFSRsaKey(commonHardcodeTestKey, "binary_rsa_privkey")
	require.Nil(t, err)

	//ks, err := keystore.NewFSKeystore("/home/chris/work/otm/compose/ipfs0/keystore/")
	//expectName := "QmQFsV3XBtEoYnABnJLAey78LVx1Aexc7k3xtppVynv8RU" //seems this is the name that testKey3 will get
	expectName := commonHardcodeProfileId
	//get it using basically the same code that ipfs itself uses
	//which, upon deeper reading, showed me that its just taking the public key out of the private key, sticking that into pubkey protobuf format, serializing that, hash that, and b58 the result.
	gotName, _ := Crypter.getIPFSNameFromBinaryRsaKey("binary_rsa_privkey")
	if gotName != expectName {
		t.Fatalf("got something unexpected for the name :(")
	}

	keyReadback, _ := Crypter.readBinaryIPFSRsaKey("binary_rsa_privkey")
	//so armed with the insight from poking around in the code above,
	//we can now just take the rsa pubkey that we might have, say,
	//got from some profile struct (which will be MarshalPKCS1PublicKey format),
	//and get the peer id directly from that without having to read a ipfs private key protobuf
	//from the filesystem first!!
	//though, note, we are in this test for convenience still doign that as a first step,
	//but you can clearly see the argument for getPeerIDBase58FromPubkey is just a rsa PublicKey! :)
	gotName2 := Crypter.getPeerIDBase58FromPubkey(&keyReadback.PublicKey)
	if gotName2 != expectName {
		t.Fatalf("got something unexpected for the name using preferred code :(")
	}
}

func Test_encrypt_decrypt_sign_verify(t *testing.T) {
	// The GenerateKey method takes in a reader that returns random bits, and
	// the number of bits
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}

	// The public key is a part of the *rsa.PrivateKey struct
	publicKey := privateKey.PublicKey

	// use the public and private keys
	// ...
	// https://play.golang.org/p/tldFUt2c4nx
	modulusBytes := base64.StdEncoding.EncodeToString(privateKey.N.Bytes())
								privateExponentBytes := base64.StdEncoding.EncodeToString(privateKey.D.Bytes())
	fmt.Println(modulusBytes)
	fmt.Println(privateExponentBytes)
	fmt.Println(publicKey.E)

	encryptedBytes, err := rsa.EncryptOAEP(
		sha256.New(),
		rand.Reader,
		&publicKey,
		[]byte("super secret message"),
		nil)
	if err != nil {
		panic(err)
	}

	fmt.Println("encrypted bytes: ", encryptedBytes)

	// The first argument is an optional random data generator (the rand.Reader we used before)
	// we can set this value as nil
	// The OEAPOptions in the end signify that we encrypted the data using OEAP, and that we used
	// SHA256 to hash the input.
	decryptedBytes, err := privateKey.Decrypt(nil, encryptedBytes, &rsa.OAEPOptions{Hash: crypto.SHA256})
	if err != nil {
		panic(err)
	}

	// We get back the original information in the form of bytes, which we
	// the cast to a string and print
	fmt.Println("decrypted message: ", string(decryptedBytes))

	msg := []byte("verifiable message")

	// Before signing, we need to hash our message
	// The hash is what we actually sign
	msgHash := sha256.New()
	_, err = msgHash.Write(msg)
	if err != nil {
		panic(err)
	}
	msgHashSum := msgHash.Sum(nil)

	// In order to generate the signature, we provide a random number generator,
	// our private key, the hashing algorithm that we used, and the hash sum
	// of our message
	signature, err := rsa.SignPSS(rand.Reader, privateKey, crypto.SHA256, msgHashSum, nil)
	if err != nil {
		panic(err)
	}

	// To verify the signature, we provide the public key, the hashing algorithm
	// the hash sum of our message and the signature we generated previously
	// there is an optional "options" parameter which can omit for now
	err = rsa.VerifyPSS(&publicKey, crypto.SHA256, msgHashSum, signature, nil)
	if err != nil {
		fmt.Println("could not verify signature: ", err)
		return
	}
	// If we don't get any error from the `VerifyPSS` method, that means our
	// signature is valid
	fmt.Println("signature verified")
}

func Test_JSONTime(t *testing.T) {
	stupid := Post{
		MimeType: "x",
		Cid:      "y",
		Date:     JSONTime{},
		Reply:    nil,
	}
	poopid, err := json.Marshal(stupid)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("%s\n\n", poopid)
	t.Log("GOOD TO GO")
}

func Test_make_profile(t *testing.T) {
	//lets use one of the keys we made had IPFS make earlier (copied testKey3 to this local binary_rsa_privkey)
	//keyReadback := Crypter.readBinaryIPFSRsaKey("binary_rsa_privkey")
	keyReadback := commonIpfsTestKey

	//we can get an ID for this key but taking the pubkey and hashing it.
	pubKeyBytes := x509.MarshalPKCS1PublicKey(&keyReadback.PublicKey)
	pubKeyHash := Crypter.makeMsgHashSum(pubKeyBytes)
	_ = pubKeyHash

	//in order to create the profile record it needs a social graph tip.

	//in order to create that now, we first need the cid of some content that is our post.
	cid := IPFS.addContentToIPFS([]byte("I am potato lord !!! hello world ???")) // I suspect there may even be other nodes already hosting this content.
	fmt.Printf("the content cid is %s\n", cid)

	//then we can create a graph node that references our content
	socialTip := GraphNode{
		Version:   1,
		Previous:  nil, //special case, this is the root node.
		ProfileId: string(pubKeyHash),
		Post: &Post{
			MimeType: "text/plain",
			Cid: cid,
			Date: JSONTime(time.Now()),
			Reply: nil,
		},
		PublicFollow: nil,
	}
	//_ = IPNSName
	_ = socialTip

	//we have to sign this data with our private key for authenticity.
	socialTip.Sign(keyReadback, Crypter)

	serializedGraphNode, err := json.Marshal(socialTip)
	checkError(err)

	//now we can stick that signed json encoeded data into ipfs
	tipCid := IPFS.addContentToIPFS(serializedGraphNode)

	//whew now we have the essentials of a profile.
	profile := Profile{
		Id:      string(pubKeyHash),
		Pubkey:  pubKeyBytes,
		//IPNS:    IPNSName,
		GraphTip: tipCid,
		//Socials: nil,
	}
	profileJson, err := json.Marshal(profile)
	checkError(err)

	//create that badboy in ipfs.
	//note, that every single time we make a new post later we will be wanting to update this so that our followers can find our latest social graph tip.
	profileCid := IPFS.addContentToIPFS(profileJson)
	t.Logf("profile cid is currently: %s\n", profileCid)
	t.Log("publishing ipns update ....")

	//this is where we can update our IPNS entry to point it to this latest profile cid.
	//and of course, the server component would be able to take in an update much faster than IPNS
	//IPNSName := IPFS.publishIPNSUpdate(profileCid, "test_key")
	IPNSName := IPFS.publishIPNSUpdate(profileCid, "test_key")
	// i already know the ipns for the hardcoded key i'm toying with is QmQFsV3XBtEoYnABnJLAey78LVx1Aexc7k3xtppVynv8RU
	require.Equal(t, commonIpfsKeyProfileIdb36IPNSName, IPNSName )
	fmt.Println("got here without dying")
}

func Test_sign_and_verify_graphnode(t *testing.T) {
	//lets use one of the keys we made had IPFS make earlier (copied testKey3 to this local binary_rsa_privkey)
	keyReadback, _ := Crypter.readBinaryIPFSRsaKey("test_key")
	post := Post{
		MimeType: "text/plain",
		Cid: "abcdpotatoes",
		Date: JSONTime(time.Now().UTC()),
		Reply: nil,
	}
	tl := &Timeline{crypter: Crypter, ipfs: IPFS}
	//graphnode := tl.createSignedGraphNode(keyReadback, &post, nil, nil)

	_, profileId := tl.calculateProfileId(&keyReadback.PublicKey)
	graphnode := &GraphNode{
		Version:      1,
		Previous:     nil,
		ProfileId:    profileId,
		Post:         &post,
	}
	graphnode.Sign(keyReadback, Crypter)
	validSig := tl.checkGraphNodeSignature(graphnode, &keyReadback.PublicKey)
	if !validSig {
		t.Fatal("bad sig")
	}
}

func Test_sign_and_verify_profile(t *testing.T) {
	//lets use one of the keys we made had IPFS make earlier (copied testKey3 to this local binary_rsa_privkey)
	keyReadback, _ := Crypter.readBinaryIPFSRsaKey("test_key")
	tl := &Timeline{crypter: Crypter, ipfs: IPFS}
	profile := tl.createSignedProfile(
		keyReadback,
		"Alex Jones",
		"i am a gorilla.",
		"cid of post history tip",
		nil)
	validSig, _ := tl.checkProfileSignature(profile, &keyReadback.PublicKey)
	if !validSig {
		t.Fatal("bad sig")
	}
}

type testTimeService struct {
	curTime JSONTime
	incrementSec int64
}
func (ts *testTimeService) GetTime() JSONTime {
	reportedTime := ts.curTime
	ts.curTime = JSONTime(time.Time(ts.curTime).Add(time.Second * time.Duration(ts.incrementSec)))
	timestamp, _ := ts.curTime.MarshalJSON()
	log.Printf("testTimeService GetTime: %s", timestamp)
	return reportedTime
}

func Test_create_and_read_back_chain_of_posts(t *testing.T) {
	// make a profile, I suppose until we make a first post it can have a blank value for GraphTip.
	Federation.Init()
	createdProfileInfo := createChainOfPosts(t)
	readBackChainOfPosts(t, createdProfileInfo)
}
func createChainOfPosts(t *testing.T) []*TLProfile {
	timeService := &testTimeService{
		curTime: JSONTime(time.Now().UTC()),
		incrementSec: 17,
	}

	frodoTl, err := CreateTimelineWithFirstTextPost(&TLCreateProfileArgs{
		DisplayName:   "Frodo Baggins",
		Bio:           "Friendly Hobbit",
		FirstPostText: "My Uncle has a magical ring.",
		TimeService:  timeService,
		IPNSDelegated: true,
	})
	require.Nil(t, err)
	frodoPostGraphNodeCid := frodoTl.profile.GraphTip
	t.Logf("created frodo, profile id/ipns is %s, profile cid is %s, tip graphnode is %s", frodoTl.profileId, frodoTl.profile.cid, frodoTl.profile.GraphTip)

	samTl, err := CreateTimelineWithFirstTextPost(&TLCreateProfileArgs{
		DisplayName:   "Samwise Gamgee",
		Bio:           "Gardiner Extraordinaire",
		FirstPostText: "I'm going to enjoy tending my garden right here in the Shire for the next few months.",
		TimeService:  timeService,
		IPNSDelegated: true,
	})
	require.Nil(t, err)
	t.Logf("created sam, profile id/ipns is %s, profile cid is %s, tip graphnode is %s", samTl.profileId, samTl.profile.cid, samTl.profile.GraphTip)


	t.Logf("frodo profile current cid: %s", frodoTl.profile.cid)
	t.Logf("sam profile current cid: %s", samTl.profile.cid)

	gandalfTl, err := CreateTimelineWithFirstTextPost(&TLCreateProfileArgs{
		DisplayName:   "Gandalf the Grey",
		Bio:           "Wizard",
		FirstPostText: "Off to the Shire to see my friend Bilbo",
		TimeService:  timeService,
		IPNSDelegated: true,
	})

	smeagolTl, err := CreateTimelineWithFirstTextPost(&TLCreateProfileArgs{
		DisplayName:   "Gollum",
		Bio:           "Gollum",
		FirstPostText: "Gollum",
		TimeService:  timeService,
		IPNSDelegated: true,
	})

	bilboTl, err := CreateTimelineWithFirstTextPost(&TLCreateProfileArgs{
		DisplayName:   "Bilbo Baggins",
		Bio:           "Adventurous Hobbit, Non-Thief.",
		FirstPostText: "I've been there -- and I got back again. Ask me about it.",
		TimeService:  timeService,
		IPNSDelegated: true,
	})

	sackvilleTl, err := CreateTimelineWithFirstTextPost(&TLCreateProfileArgs{
		DisplayName:   "Sackville Baggins",
		Bio:           "Kinda scummy people",
		FirstPostText: "Lets take Bilbos shit.",
		TimeService:  timeService,
		IPNSDelegated: true,
	})


	//Sam saw someone repost Frodo posting about rings and has something to say along with following him.
	samPostTLGraphNode, err := samTl.NewTextPostGraphNode("Oh Mr. Frodo, I didn't know you were on here -- also I need a ring to propose with to Rosie")
	samPostTLGraphNode.SetAsReplyTo([]string{frodoPostGraphNodeCid})
	samPostTLGraphNode.AddPublicFollow([]string{frodoTl.profileId})
	samTl.PublishGraphNode(samPostTLGraphNode)
	require.Nil(t, err)
	t.Logf("sam profile, updated cid: %s, updated tip: %s", samTl.profile.cid, samTl.profile.GraphTip)

	//Frodo has somehow discovered that Sam followed him, so he follows back (without text reply)
	//Frodo also follows Gandalf and Bilbo because why not.
	//I suppose smeagols reply will go unseen by frodo for now.
	//maybe gandalf should follow smeagol though.

	frodoFollowsSamGraphNode := frodoTl.NewTLGraphNode()
	frodoFollowsSamGraphNode.AddPublicFollow([]string{samTl.profileId, gandalfTl.profileId, bilboTl.profileId, sackvilleTl.profileId, "QmWVyRwKj24xxxxxxxxxxxxxxxxxxxxxxxxxxgYZqU4kXX"})
	frodoTl.PublishGraphNode(frodoFollowsSamGraphNode)
	frodoProfileCid := frodoTl.profile.cid
	t.Logf("frodo profile, updated cid: %s", frodoProfileCid)

	//gandalf follows smeagol as well as frodo and sam with this node and thus when we show his timeline he should have smeagols reply to frodo showing. frodo can't see it though.
	gandalfTlPostTLGraphNode, err := gandalfTl.NewTextPostGraphNode("We have to talk about this ring, I'll be arriving soon to discuss in person.")
	gandalfTlPostTLGraphNode.SetAsReplyTo([]string{frodoPostGraphNodeCid, samPostTLGraphNode.cid})
	gandalfTlPostTLGraphNode.AddPublicFollow([]string{frodoTl.profileId, samTl.profileId, bilboTl.profileId, smeagolTl.profileId})
	gandalfTl.PublishGraphNode(gandalfTlPostTLGraphNode)

	//nobody is following smeagol except for Gandalf down below. smeagol follows bilbo and frodo b/c frodo is talking about his precious.
	smeagolPostTLGraphNode, err := smeagolTl.NewTextPostGraphNode("Thief, Baggins!")
	smeagolPostTLGraphNode.SetAsReplyTo([]string{frodoPostGraphNodeCid})
	smeagolPostTLGraphNode.AddPublicFollow([]string{frodoTl.profileId, bilboTl.profileId})
	smeagolTl.PublishGraphNode(smeagolPostTLGraphNode)

	//TODO: gandalf should RP smeagols post so that frodo can see it, then frodo can engage further with that.
		//RP without post.
	gandalfRpGollumGraphNode := gandalfTl.NewTLGraphNode()
	gandalfRpGollumGraphNode.SetAsRepostOf(smeagolPostTLGraphNode.cid)
	gandalfTl.PublishGraphNode(gandalfRpGollumGraphNode)


	bilboTlPostTLGraphNode, err := bilboTl.NewTextPostGraphNode("Nephew, delete this!") // <-- which is funny because while we will be able to rewrite history or publish retractions, we can't stop anyone from archiving and preserving old cids that we wish we had not created
	bilboTlPostTLGraphNode.SetAsReplyTo([]string{frodoPostGraphNodeCid})
	bilboTlPostTLGraphNode.AddPublicFollow([]string{smeagolTl.profileId, frodoTl.profileId, samTl.profileId})
	bilboTl.PublishGraphNode(bilboTlPostTLGraphNode)

	//Frodo should see this post nested underneath Sams reply with an extra indent.
	bilboTlPostTLGraphNode, err = bilboTl.NewTextPostGraphNode("Don't even think about is master Samwise!")
	bilboTlPostTLGraphNode.SetAsReplyTo([]string{samPostTLGraphNode.cid})
	bilboTl.PublishGraphNode(bilboTlPostTLGraphNode)

	// Frodo sees Bilbo's directive to delete the post about the ring.
	frodoRetractsRingPostGraphNode := frodoTl.NewTLGraphNode()
	frodoRetractsRingPostGraphNode.AddRetraction(frodoPostGraphNodeCid)
	frodoRetractsRingPostGraphNode.AddPublicUnfollow([]string{sackvilleTl.profileId})
	frodoTl.PublishGraphNode(frodoRetractsRingPostGraphNode)
	frodoProfileCid = frodoTl.profile.cid
	t.Logf("frodo profile, updated cid after retraction and unfollow of sackville: %s", frodoProfileCid)


	t.Logf("publishing frodo and sam latest profile info to their respective IPNS...")
	//var wg sync.WaitGroup
	ipnsToPublish := []*TLProfile{
		frodoTl.profile,
		samTl.profile,
		gandalfTl.profile,
		smeagolTl.profile,
		bilboTl.profile,
		sackvilleTl.profile,
	}

	for _, profile := range ipnsToPublish {
		Federation.Set(profile.Id, profile.cid)
	}
	log.Printf("IPNSDelegatedProfileCids: %#v", Federation.IPNSDelegatedProfileCids)


	//wg.Add(len(ipnsToPublish))
	//for _, profile := range ipnsToPublish {
	//	go wgIPNSPublisher(&wg, profile)
	//}
	//wg.Wait()
	t.Log("ipns updates Completed")
	return ipnsToPublish
}


func readBackChainOfPosts(t *testing.T, createdProfileInfo []*TLProfile) {
	//needs to do it in a way using ipns delegate federation as we put the cids in there only, trying to avoid ipns in tests except for basic smokte test.
	//for _, name := range []string{
	//	"bilbo-baggins",
	//	"frodo-baggins",
	//	"gandalf-the-grey",
	//	"gollum",
	//	"samwise-gamgee",
	//} {
	//	privateKey, _ := Crypter.readBinaryIPFSRsaKey(name)
	//	t.Logf("keyname: %s profileId %s", name, Crypter.getPeerIDBase58FromPubkey(&privateKey.PublicKey))
	//}
	//panic("nope")

	//going to start with frodo, so need to figure frodos profile id we created
	var frodoProfileId string
	for _, e := range createdProfileInfo {
		if e.DisplayName == "Frodo Baggins" {
			frodoProfileId = e.Id
			break
		}
	}
	//this should be run after the one above.
	frodoTl := &Timeline{
		crypter:   Crypter,
		ipfs:      IPFS,
		profileId: frodoProfileId,
		//profileId: "QmUGQHvJcyR3CpcMAwjg3BGJaXTLb4QgesVDy1yt85E56w", // frodo
		//profileId: "QmU6WDwv5MFyZWLDZjCUbDPLPwBj3QjmPNUc2Bcjfi6hGP", //gandalf
		//profileId: "QmPj1shPErUCCdpffMtcBUmE64ZqFeigirrUSbu9qznc7c", //bilbo
		//profileId: "QmauiUf3x6C9Xx9cPS4hfQRaHpbHXE9MXvetpiCiMvNU6G", //sam
		//profileId: "QmNup8hD2YEaGbHt7BpKub9oAM1VrGAWe44a3p5rdFWwK4", //smeagol

	}
	log.Printf("IPNSDelegatedProfileCids: %#v", Federation.IPNSDelegatedProfileCids)

	err := frodoTl.LoadProfile()
	require.Nil(t, err)
	err = frodoTl.LoadHistory()
	require.Nil(t, err)

	//frodo has a text post and then a follow, follow being the most recent. the last element of the history should be his first post, about a ring.
	frodoTimelineAsText := frodoTl.generateTextTimeline()

	log.Printf("%s history, newest to oldest", frodoTl.profile.DisplayName)
	for lineIndex, text := range frodoTimelineAsText {
		_ = lineIndex
		log.Println(text)
	}

	require.Equal(t, 13, len(frodoTimelineAsText))
	nextLine := func() string {
		var line string
		line, frodoTimelineAsText = frodoTimelineAsText[0], frodoTimelineAsText[1:]
		return line
	}
	assert.Regexp(t, "Gandalf.*Gollum.*Thief", nextLine())
	//assert.Regexp(t, "Sackville.*Lets take Bilbos shit", nextLine()) <-- unfollowed.
	assert.Regexp(t, "Bilbo.*and I got back again", nextLine())
	assert.Regexp(t, "Gandalf.*to the Shire", nextLine())
	assert.Regexp(t, "Sam.*tending my garden", nextLine())
	assert.Regexp(t, "Follow of Samwise", nextLine())
	assert.Regexp(t, "Follow of Gandalf", nextLine())
	assert.Regexp(t, "Follow of Bilbo", nextLine())
	//assert.Regexp(t, "Follow of Sackville", nextLine()) <-- goes away due to unfollow.
	assert.Regexp(t, "Follow of profileId QmWVyRwKj24xxx", nextLine())
	assert.Regexp(t, "Frodo.*Retracted", nextLine())
	//assert.Regexp(t, "Frodo.*My Uncle has a magical ring.", nextLine())
	assert.Regexp(t, "\tSamwise.*ring to propose", nextLine())
	assert.Regexp(t, "\t\tGandalf.*have to talk", nextLine())
	assert.Regexp(t, "\t\tBilbo.*even think", nextLine())
	assert.Regexp(t, "\tBilbo.*delete", nextLine())

	//assert.Contains(t, frodoTimelineAsText[1], "")
	////assert.Contains(t, , "\tSamwise")
	////assert.Contains(t, frodoTimelineAsText[2], "I need a ring to propose with")

	//TODO for the above: i would like to see Frodo reply to his own thread and maybe inform Sam that this ring is too powerful for a wedding ring.
	// and since Frodo follows sam, when constructing the timeline i would expect to see Sams post about tending his garden too.
	// also lets finally get Smeagol and Gandalf in on the action.
}

func _Test_read_chain_of_posts2(t *testing.T) {
	//intention of this was to just test history collectino of a profile i was working with in the browser

	var err error
	initializers()

	tl := &Timeline{
		crypter: Crypter,
		ipfs: IPFS,
		//profileId: "QmPwqLoU4qENVvEkLRXpGfYJu7NUDfHp149uoj5G8zu3PL",
		profileId: "QmPwqLoU4qENVvEkLRXpGfYJu7NUDfHp149uoj5G8zu3PL",
		ipnsDelegated: true,
	}

	err = tl.LoadProfile()
	require.Nil(t, err)
	err = tl.LoadHistory()
	require.Nil(t, err)

	timelineAsText := tl.generateTextTimeline()
	log.Printf("%s history, newest to oldest", tl.profile.DisplayName)
	for lineIndex, text := range timelineAsText {
		_ = lineIndex
		log.Println(text)
	}
}

func Test_b64_pubkey_from_browser(t *testing.T) {
	pubkeyb64 := `pubkey b64 in PKIX MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArIqb6VwlJKjycV2WKHpefsDCKs45JRkBn5+RjV/ik5rr204Uuop1cekSeIdFGXEhTpRotqyfj2MMYcKnAGGeKZC3lj/SwZqvbeL8gh0ZtVKJf+EPhEt1S/DsE74NPPlhuQTFKKhBX/MvfJ3dHvJGErJAGJ01mTlHlJEqdCrR0hdarfBLfdYOoUXFDcDR3TL/FMELW5qJU5Z8agTichZvZDWHUjVK0Cvp4wHpaB0h7kH/aktNPiYMbgOBprRsW7SiefJ4VvDNdI8Ok4f6M+ySx8m0YKeYhCA1djdyDkOIfFKAFVwCC1r/2WxBa5si8aUSo3bm37+yuhoxUKiMfGjnCwIDAQAB`

	decoded, err := base64.StdEncoding.DecodeString(pubkeyb64)
	if err != nil {
		fmt.Println("decode error:", err)
		return
	}
	//pubkey, err := x509.ParsePKCS1PublicKey(decoded)
	// browser built-in stuff wants to use this export format. fine with me, it seems to work just as well.
	//TODO: figure out how to do this in the browser.
	pubkey, err := x509.ParsePKIXPublicKey(decoded)
	if err != nil {
		t.Fatal(err)
	}
	foo := pubkey.(*rsa.PublicKey)
	_ = pubkey
	_ = foo
	fakey := Profile{
		Id:          Crypter.getPeerIDBase58FromPubkey(foo),
		Pubkey:      x509.MarshalPKCS1PublicKey(foo),
		GraphTip:    "",
		DisplayName: "Bob",
		Bio:         "lol",
		Previous:    nil,
		Signature:   nil,
	}

	fakey.Signature = nil
	serializedProfile, err := json.Marshal(fakey)
	require.Nil(t, err)
	t.Logf("serializedProfile: %s", serializedProfile)
	profileHash := Crypter.makeMsgHashSum(serializedProfile)
	t.Logf("profileHash got %d bytes", len(profileHash))
	t.Log(profileHash)
	sEnc := base64.StdEncoding.EncodeToString(serializedProfile) //<--- NOT the hash, over in JS we need to feed the whole thing in and let the library hash it or whatever. omfg wasted like 3 hours to that.
	t.Log(sEnc)

	//sigB64FromBrowser := `ZQfn0ZKYy2iWY3i/P1V3kUGX2W+/zbmN7R4FkYHZxySqOK/mB/Jifl4kBWGrvNP8tbth8EYWxIV26fqwXwbkw2fHGiN0i+O3AsXNCycr034qzSehdngCYG/Rctzro4Z+JOlCJnguoKGZzuqQQ9Y2UG7kfi8TzuF6o2shgS++aYMSbVX7aw5tQawWE9UsWWJ0gaDJpjsICxf9xr6cFhUJ/V3hEx0ry7+TFBODDTBBnAS/91lFuBKbuR2vkZw7bk21FGyqjGx5bh92NfOc1PJNjqTohGziY+sawCyRvgyPBzIbZzzcD4kqjJmyBBEvHUxcBN5cdvHIkLHT0gyi2nkhwg==`
	sigB64FromBrowser := `HQfIVHTvC/RaJ0ot4pPQZiy5+1H8PQDAO2fdP2T+8mkBtfZUGDkYJ3GM1sOLm+4PryDewySfvml3CDWYym7wTflXHVz+hJoyOtbA9lM9//CZ5i4iY0ZsDnIgnX6yX4zdg7jpLfMe0tL9Sv77cSkeKdAblaSZZ2pX4yVZTYQ0X7HxZeKT2/fc37mBREoGCCkUMAoWw6htfXnMuWeHftwXqpC4Z+rmPDsn/h5ER9sLGXLWh3S6RTRHVkhY+uVkcNzxfXm8ASJCSFSnVzYSgA0VHW4temXvGjbGy9Pjw/BFR35hkGF8mbqR16Eykb3RmBFA7NP6wPiaNxLWzVPwzTpYbw==`
	sigFromBrowser, err := base64.StdEncoding.DecodeString(sigB64FromBrowser)
	fakey.Signature = sigFromBrowser

	testTl := &Timeline{
		crypter: Crypter,
	}
	_ = testTl
	log.Printf("profile: %#v", fakey)
	t.Logf("byte len of sig: %d", len(sigFromBrowser))

	//i was literally going nuts because i couldnt get the sig to verify. learned the hard way about assumptions once again. in js-land, you feed the data in, not a hash. it does the hashing. here we do the hashing. i neeeded to be sending the unsigned data to the client, not a hash of it.
	err = rsa.VerifyPSS(foo, crypto.SHA256, profileHash, sigFromBrowser, nil)
	require.Nil(t, err)

}

func Test_b64_privkey_from_browser(t *testing.T) {

	privkeyB64 := "MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCZt4F8GgYwI1U2DmzBhXfK8c2sNwz2clpe9w+uMCQ6QD/dwk5acl1AATs+mzzUBB6NupAl+PnXtDV2+kHxka86EKdKOUXSMZ07XAjhk75OJw5bjG4heNelrsBf01BnfgXUz6Q4wd5+tK6Vh1CP+n5lfJ2g88D95YW4ek6fvNJyHP07iNDOemIAchoASEheBh8iQSza1iyzbYBZGhB6R9+/8S7Ib/Xw0F/acSaqy83AK5R7pJOjSULop/aD/2du6oy/di3tJjoVBTBmrP3p1BSygFq2rc3utdMPPU/LSC9RPo7xEqcBd0cWbK2P+oc9hfe3MdjrnnbC46il80kyKZZlAgMBAAECggEAPG3rtYH1lM8PHKUnFB0ILvxIQr+RlQD3jgXKYEwEsfG4KdHNQ7lZ92OEiuQ0UZUc/dKuAH+UmLv7mL5hVjpTjJwnaAKD9FIU4dUYmLWgRtELz+mxEe+Tt0qvzfwgy867NCI9CSMN+PnG+HmtrixnrDYFMdUhta6ZlyBd8GYmxT0LoI/mHJCMr1AZEkY6fl0saDZB9kLy6gwSI2Akgv8lNp79PLOnbbv56EiOZoN9/0VQjTspD8bF28VzJgzzJ0tzw/Cx+1fOOrdmvHY8tsxpjeRbU8NJwJjvbiiMI5qZrhyyWqEfIDd30OoiF5nR2OoDqASbpQPTxIgKYbVlzT/2MQKBgQDZYXcCmE+iF5tdMaM1muLgEPDiGReHVPTAAn2blGH1iuOHI4V1hovF42tNkEv5qDqXv6zP66euQEGARdIIGOM+l4PZbixe0odb+uw0MObNjRz7S9ANoKSj2jk5Oy9nfT4K2wqq6OPHdSUhC8G34fGdYLc1Q5jxXnhSwjKgdsT5ZwKBgQC1BpbOhmLv7F5OIesY1mC0djNgInnVxN2puoxSNXjFn7pZllxAaUe+r+TVLY7tOZKiK0H8cczY4BckDezkuBggfqBve5RzTO2oqaCAx4CSH2hJ/lXYv98GhE7n5nndpCoqG/Vd0QxnV34hEUd2LoJ2OAgOg/pOGlX2mkP7kyc2UwKBgBwYIp9tO+2BC41R2vwUlnnK9rbh806ERlWCfOVcmgR3/Mv8ZUU5LFtY9wdBPPB5M4llNlpw5Gz61PxVCb4OKWBviJTTTly67M+QcHKWV139fN9lfvAj8ONUUsz4vzmq0BfrE0ffbYDbvP62XET9qJJka4kwwVWAliBsBMsETpTFAoGAXJPeFAiOGH0dTX/zJ2SbWC8K3yNCg5yGcALDOFe4R/kD6EUJMLemxVJXCN6ftZo370+IE35vcIpJy1qDyASN8jBQBDODG+Q/tn3pY3Kjwhbl0tGLPaoCeOa5I8eukzcdiSN7PFtoqIEKNAcOMNZgSe0l0aaVH9RAGjmSgtoit5kCgYBUmtoKYk24ZSDuj9O42PWzCEh1TtZ4Rq4a53yvmalE98Evo7+AaMeQaZkWIAoG00ic1AnZXM+9+BfzgnZK4tgfU5Y7HB0Q96M07X+XFfXfD8Eg1V+E+6GGoqPBoCM8ByQNcZzLH/0BVQ6ndD/MGn3ga8rJXcSsTXNjT+xtEs8waw=="
	decodedPriv, err := base64.StdEncoding.DecodeString(privkeyB64)
	if err != nil {
		fmt.Println("decode error:", err)
		return
	}
	// browser built-in stuff wants to use this export format. fine with me, it seems to work just as well.
	privkey, err := x509.ParsePKCS8PrivateKey(decodedPriv)
	if err != nil {
		t.Fatal(err)
	}
	foo2 := privkey.(*rsa.PrivateKey)
	peerId := Crypter.getPeerIDBase58FromPubkey(&foo2.PublicKey)
	require.Equal(t, "Qmc6fkHsvBRaHZjGMVsh8VDoUFjnnUZvAw6uvNRuaeRCGu", peerId)
	//IPFS.addPrivKeyIPNSPublish(foo2, peerId, "QmV6j8EmP5ELE1WhjMmfYCfJiBPoU95ENqPFKdonL3Kxxd")

}

func _Test_http_service(t *testing.T) {
	// was using this to test api server but recently seems more convenient to just build/run on cli for that.
	// the code below that which tests a specific server method input/output could be good example to keep around.

	initializers()
	service := &APIService{
		TimeService: &defaultTimeService{},
		FilePathOverride: "../web",
		ListenPort: "4588",
	}

	//uncomment these two lines to run the server and do manual interaction with it.
	go IPFS.StartIPNSPeriodicUpdater()
	service.Start()
	log.Printf("but i no see this?")
	return

	//jsonbody := `{"pubkey": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvmD0guNxb3MBHIXNNaYFNoBLSJQh0BUWYQsbb6GUdG3URY8Gc98U/o6genJ2YZrhE0JTr7wl7TqJvvnOHrhS1CTX04qp6Yq/u2y8SYP3wcYxzd00aFI9aAd7vpPSe1GQPdpbY9XEeMQKOkbYDfmIefU/r+WAKiGfJFKMO8PhLsatWRwDaapL3MusqJxk2PyGjfS210yWhSh8ReJRAMCEkRQWiN17KXGlCN/g7SRnmHRAfyo7wsl3mClJunGgKe6i0brWvibcu3/YWaFhdnzpxuxp1Bw0VJgoccQy2JXKzwTa8GhZFFbJ4COMJAsHBsmhAVKW2jRg60IULayQo1QnWwIDAQAB","text": "i am the very model of a modern major pain in the goddam ass."}`
	//jsonbody := `{"pubkey": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvmD0guNxb3MBHIXNNaYFNoBLSJQh0BUWYQsbb6GUdG3URY8Gc98U/o6genJ2YZrhE0JTr7wl7TqJvvnOHrhS1CTX04qp6Yq/u2y8SYP3wcYxzd00aFI9aAd7vpPSe1GQPdpbY9XEeMQKOkbYDfmIefU/r+WAKiGfJFKMO8PhLsatWRwDaapL3MusqJxk2PyGjfS210yWhSh8ReJRAMCEkRQWiN17KXGlCN/g7SRnmHRAfyo7wsl3mClJunGgKe6i0brWvibcu3/YWaFhdnzpxuxp1Bw0VJgoccQy2JXKzwTa8GhZFFbJ4COMJAsHBsmhAVKW2jRg60IULayQo1QnWwIDAQAB","profiletip": "QmUGpKuhjAs4Absv5n4K8aFXAZCU4G9RncoqhvxnJJkvT1"}`
	jsonbody := `{"pubkey":"MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArW108bU8G0lvFM/qmrr8wlIr8CWboHMY1mkV5YXKCVodXZaRPczf8SzWwZEA7NtDOz9yUTC7tdFn9HqwzsSZPnPpptb6/71dt2cZxeWzxkBsu35nCPxE2f6WWMv2lcC7MCAYjrMl2wuxDVuBKzObZ7llVOS5d8aToEQhxTDuDYOzWVxtoMvQDGUTEawshwkX57dWWlyVHLoodzIQGwc4QUYJGfi0bdPORP+q/a/qAtg6Oqc/VjOUU3lasDT6Dh5y5FJdu2/Mu9Rp4ywBs8M0EXppP+JMsx167QYpUjZR0Inz5BsePaQAkCSiMIfafcx58fGOgP2C1KtTQvEVd3nkiQIDAQAB","profiletip":"QmXssuJCMGoHpihPK3b7gYEHWarfHWmfCttsByePgoRw3w"}`
	req := httptest.NewRequest("POST", "/history", strings.NewReader(jsonbody))
	w := httptest.NewRecorder()
	service.history(w, req)

	resp := w.Result()
	json, _ := ioutil.ReadAll(resp.Body)
	t.Log(string(json))
	t.Log(resp.StatusCode)

	//assert.Equal(t, data.expectedStatus, resp.StatusCode, data.jsonBody)
}

type mockFederationMember struct {
	list map[string]string
}
func (mf *mockFederationMember) ResolveFetch() (map[string]string, error) {
	return mf.list, nil
}

func Test_IPNSDelegateFederation(t *testing.T) {
	timeService := &testTimeService{
		curTime: JSONTime(time.Now().UTC()),
		incrementSec: 17,
	}

	//delegate maps d1, d2
	d1mockResolverFetcher := mockFederationMember{ list: map[string]string{}}
	d2mockResolverFetcher := mockFederationMember{ list: map[string]string{}}
	//mockMember1resolverFetcher := mockFederationMember{ list: map[string]string{}}
	//d2 := mockFederationMember{ list: map[string]string{}}
	//_, _ = d1, d2

	fedMember1 := IPNSFederationMember{
		name: "d1",
		resolverFetcher: &d1mockResolverFetcher,
	}
	fedMember2 := IPNSFederationMember{
		name: "d2",
		resolverFetcher: &d2mockResolverFetcher,
	}
	_, _ = fedMember1, fedMember2

	timelines := []*Timeline{}
	for i := 0; i < 4; i++ {
		tl, err := CreateTimelineWithFirstTextPost(&TLCreateProfileArgs{
			DisplayName:   fmt.Sprintf("Profile %d", i),
			Bio:           fmt.Sprintf("Profile %d bio", i),
			FirstPostText: fmt.Sprintf("Profile %d first post text", i),
			TimeService:  timeService,
			IPNSDelegated: true,
		})
		require.Nil(t, err)
		timelines = append(timelines, tl)
	}

	//create a profile p1 with a few posts history (add 1 post after created so there are 2)
	t.Logf("p1a id %s profilecid after first post: %s", timelines[0].profile.Id, timelines[0].profile.cid)
	gn, err := timelines[0].NewTextPostGraphNode("2nd post from p1")
	require.Nil(t, err)
	timelines[0].PublishGraphNode(gn)
	//get cid of profile tip for d1 - p1aN1
	p1aN1 := timelines[0].profile.cid
	_ = p1aN1

	//create same profile p1 over again, one post
	dupTl0, err := CreateTimelineWithFirstTextPost(&TLCreateProfileArgs{
		DisplayName:   timelines[0].profile.DisplayName,
		Bio:           timelines[0].profile.Bio,
		FirstPostText: "Alt timeline for profile 0",
		TimeService:  timeService,
		IPNSDelegated: true,
		PrivateKey: timelines[0].profile.privkey,
	})
	p1bN1 := dupTl0.profile.cid
	require.Nil(t, err)
	require.Equal(t, dupTl0.profileId, timelines[0].profileId )

	//get alternative profile tip for d2 - p1n1b
	d1mockResolverFetcher.list[timelines[0].profileId] = p1aN1 //2 history entries
	d2mockResolverFetcher.list[timelines[0].profileId] = p1bN1 //1 history entries ... same profile id.
	t.Logf("p1a id %s profilecid after 2nd post: %s", timelines[0].profile.Id, p1aN1)
	t.Logf("p1b id %s profilecid after first post of alt timeline: %s", dupTl0.profile.Id, p1bN1)
	//resolve for p1 should return the .... longest history one of competing siblings. aka p1aN1

	//create a 2nd profile p2, only one post, one tip p2n1, put in d1
	d1mockResolverFetcher.list[timelines[1].profileId] = timelines[1].profile.cid
	t.Logf("p2 id %s profilecid after first and only post: %s", timelines[1].profile.Id, timelines[1].profile.cid)
	//resolve for p2 should give p2n1

	//create a 3rd profile, p3, only one tip but 3 message history.
	p3rootProfileCid := timelines[2].profile.cid
	gn, err = timelines[2].NewTextPostGraphNode("2nd post from p3")
	require.Nil(t, err)
	timelines[2].PublishGraphNode(gn)
	gn, err = timelines[2].NewTextPostGraphNode("3rd post from p3")
	require.Nil(t, err)
	timelines[2].PublishGraphNode(gn)

	//put real tip p3n3 into d1 one delegate map
	//skip previous 1 (skip p3n2)
	//put origin p3n1 into d2
	d1mockResolverFetcher.list[timelines[2].profileId] = timelines[2].profile.cid
	d2mockResolverFetcher.list[timelines[2].profileId] = p3rootProfileCid
	t.Logf("p3 id %s profilecid after 1st post of only timeline: %s", timelines[2].profile.Id, p3rootProfileCid)
	t.Logf("p3 id %s profilecid after 3rd post of only timeline: %s", timelines[2].profile.Id, timelines[2].profile.cid)
	//resolve for p3 should give p3n3 (and should discard p3n1 only after walking history)

	//create a 4th profile, p4, only one tip but 2 message history.
	p4rootProfileCid := timelines[3].profile.cid
	gn, err = timelines[3].NewTextPostGraphNode("2nd post from p4")
	require.Nil(t, err)
	timelines[3].PublishGraphNode(gn)

	//put real tip p4n2 into d1 one delegate map
	//put previous p4n1 into d2
	d1mockResolverFetcher.list[timelines[3].profileId] = timelines[3].profile.cid
	d2mockResolverFetcher.list[timelines[3].profileId] = p4rootProfileCid
	t.Logf("p4 id %s profilecid after 1st post of only timeline: %s", timelines[3].profile.Id, p4rootProfileCid)
	t.Logf("p4 id %s profilecid after 2nd post of only timeline: %s", timelines[3].profile.Id, timelines[3].profile.cid)

	//resolve should give p4n2 and chuck p4n1 due to p4n2 content directly referring to it.


	want := []string{
		p1aN1, // first profile, with the 2 alt timelines, s.b. getting the cid of profiletip of the 'longest' one.
		timelines[1].profile.cid, //2nd profile, only one post no alt timelines.
		timelines[2].profile.cid, // 3rd profile, has 3 entry history, but we put an old one into one of the fedmember lists. should get this new one.
		timelines[3].profile.cid, // 4th profile just two entries. should be able to chuck baddy from choices without walking full history but i might just do the walk.
	}
	_ = want

	//create two ipnsdelegate maps, one mentioning each
	//add the 2nd guy to one of the delegate lists
	//make a mock that when it takes in request for delegateipns1, gives out the one cid
	//make a mock that when it takes in request for delegateipns2, gives out the other cid

	//instantiate the thing that will resolve this stuff using both of those delegateipns1 and delegateipns2 as the entirety of the federation.
	testFederation := IPNSDelegateFederation{
		Members : []IPNSFederationMember{ fedMember1, fedMember2 },
		IPNSDelegatedProfileCids: map[string]string{},
	}
	testFederation.PullUpdatesAndSelectBestTips()

	for i, e := range timelines {
		wantHere := want[i]
		got := testFederation.Get(e.profileId)
		assert.Equal(t, wantHere, *got )
	}

	//ask it to get the profiletip for p1, p2, p3, p4
	//check results are as expected from description above.

}
func TestIPNSDelegateSlam(t *testing.T) {
	Federation.Init()

	timeService := &testTimeService{
		curTime: JSONTime(time.Now().UTC()),
		incrementSec: 17,
	}

	profiles := []*TLProfile{}
	for i := 0; i < 10; i++ {
		tl, err := CreateTimelineWithFirstTextPost(&TLCreateProfileArgs{
			DisplayName:   fmt.Sprintf("Profile %d", i),
			Bio:           fmt.Sprintf("Profile %d bio", i),
			FirstPostText: fmt.Sprintf("Profile %d first post text", i),
			TimeService:  timeService,
			IPNSDelegated: true,
		})
		require.Nil(t, err)
		profiles = append(profiles, tl.profile)
	}

	allpubStart := time.Now()
	var wg sync.WaitGroup
	wg.Add(len(profiles))
	for _, profile := range profiles {
		go func(profile *TLProfile) {
			defer wg.Done()
			IPFS.updateDelegateEntry(profile.Profile, profile.cid)
		}(profile)
		//go wgIPNSPublisher(&wg, profile)
	}
	wg.Wait()
	t.Logf("%d tip updates Completed in %.2f sec", len(profiles), time.Since(allpubStart).Seconds())

	allresolveStart := time.Now()
	wg.Add(len(profiles))
	for _, profile := range profiles {
		wgTipLookerUpper(t, &wg, profile)
	}
	wg.Wait()
	t.Logf("%d tip lookups Completed in %.2f sec", len(profiles), time.Since(allresolveStart).Seconds())

}
func wgIPNSPublisher(wg *sync.WaitGroup, tlProfile *TLProfile) {
	defer wg.Done()
	return

	log.Printf("doing %s ipns update with %s...\n", tlProfile.DisplayName, tlProfile.cid)
	profileIPNS := IPFS.publishIPNSUpdate(tlProfile.cid, tlProfile.Id)
	log.Printf("%s ipns: %s\n", tlProfile.Id, profileIPNS)
}
func wgTipLookerUpper(t *testing.T, wg *sync.WaitGroup, tlProfile *TLProfile) {
	defer wg.Done()
	log.Printf("doing %s ipns lookup with %s...\n", tlProfile.DisplayName, tlProfile.cid)
	//profileTipCid, err := IPFS.resolveIPNS(tlProfile.cid)
	profileTipCid, err := IPFS.determineProfileCid(tlProfile.Id)
	require.Nil(t, err)
	require.NotNil(t, profileTipCid)
	log.Printf("profileId %s got tip %s\n", tlProfile.Id, *profileTipCid)
}


func TestDebugProfileIssue(t *testing.T) {
	//initializers()
	Federation.Init()
	//profileId := "QmbweKMsBAjrQW83ipwR8yUtQGT3j1G1km1ajNDqPvBepo"
	//profileTip := "QmXDx1BfwEG89C5dEL6o9v8p5rNepFEdR4EVnM54NA6Baq"
	profileId := "QmNMLj7t8VzxmSs7K3NxuvJmGD3JjBcH48KujDk9n7GPbj"
	profileTip :="QmbnBmWNJ1qUiaXE7TTVmYrWQCAqYVgtXL1sc1itknFQNt"

	fakeTl := &Timeline{ //just for util funcs ... maybe they dont belong where they are
		crypter:   Crypter,
		ipfs:      IPFS,
		profileId: profileId,
	}
	var err error
	fakeTl.profile, err = fakeTl.fetchCheckProfile(fakeTl.profileId, &profileTip)
	require.Nil(t, err)
	 //= profile
	err = fakeTl.LoadHistory()
	require.Nil(t, err)
	out := fakeTl.generateTextTimeline()
	require.Nil(t, err)
	for _, line := range out {
		log.Print(line)
	}
	//_ = profile
}
