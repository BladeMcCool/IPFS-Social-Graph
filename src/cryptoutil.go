package main

import (
	"bufio"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"github.com/gogo/protobuf/proto"
	ci "github.com/libp2p/go-libp2p-core/crypto"
	pb "github.com/libp2p/go-libp2p-core/crypto/pb"
	b58 "github.com/mr-tron/base58/base58"
	mh "github.com/multiformats/go-multihash"
	"io/ioutil"
	"log"
	"os"
)

type CryptoUtil struct {
	ipfsKeystorePath string
}

func (cu *CryptoUtil) makeKey(fileName string) *rsa.PrivateKey {
	key, err := cu.genKey()
	if err != nil {
		panic("cannot generate rsa key")
	}
	//pubkey := key.PublicKey
	//fmt.Printf("%#v", pubkey)
	cu.savePEMKey(fileName, key)
	fmt.Println("Private Key: ", key)
	fmt.Println("Public key: ", key.PublicKey)
	return key
}
func (cu *CryptoUtil) genKey() (*rsa.PrivateKey, error) {
	//panic("dont do it again fool")
	rando := rand.Reader
	return rsa.GenerateKey(rando, 2048)
}

func (cu *CryptoUtil) makeMsgHashSum(msg []byte) []byte{
	msgHash := sha256.New()
	_, err := msgHash.Write(msg)
	if err != nil {
		panic(err)
	}
	msgHashSum := msgHash.Sum(nil)
	return msgHashSum
}
func (cu *CryptoUtil) makeSig(key *rsa.PrivateKey, msgHashSum []byte) []byte {
	// In order to generate the signature, we provide a random number generator,
	// our private key, the hashing algorithm that we used, and the hash sum
	// of our message
	signature, err := rsa.SignPSS(rand.Reader, key, crypto.SHA256, msgHashSum, nil)
	if err != nil {
		panic(err)
	}
	return signature
}

func  (cu *CryptoUtil) savePEMKey(fileName string, key *rsa.PrivateKey) {
	outFile, err := os.Create(fileName)
	checkError(err)
	defer outFile.Close()

	var privateKey = &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	}

	err = pem.Encode(outFile, privateKey)
	checkError(err)
}

func (cu *CryptoUtil)  readKey(fileName string) *rsa.PrivateKey {
	//for standard PEM encoded rsa PKCS1 encoded RSA private key.
	privateKeyFile, err := os.Open(fileName)
	if err != nil {
		fmt.Println(err)
		os.Exit(1)
	}

	pemfileinfo, _ := privateKeyFile.Stat()
	var size int64 = pemfileinfo.Size()
	pembytes := make([]byte, size)
	buffer := bufio.NewReader(privateKeyFile)
	_, err = buffer.Read(pembytes)
	data, _ := pem.Decode([]byte(pembytes))
	privateKeyFile.Close()

	privateKeyImported, err := x509.ParsePKCS1PrivateKey(data.Bytes)
	if err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
	fmt.Println("Private Key : ", privateKeyImported)
	return privateKeyImported
}

func (cu *CryptoUtil)  readBinaryIPFSRsaKey(fileName string) *rsa.PrivateKey {
	privateKeyFile, err := os.Open(cu.ipfsKeystorePath + "/" + fileName)
	if err != nil {
		fmt.Println(err)
		//TODO probably should return an error instead.
		os.Exit(1)
	}

	pemfileinfo, _ := privateKeyFile.Stat()
	var size int64 = pemfileinfo.Size()
	rawbytes := make([]byte, size)
	buffer := bufio.NewReader(privateKeyFile)
	_, err = buffer.Read(rawbytes)
	//data, _ := pem.Decode([]byte(pembytes))
	//privateKeyFile.Close()
	key := &pb.PrivateKey{}
	if err := proto.Unmarshal(rawbytes, key); err != nil {
		log.Fatalln("Failed to parse private key protobuf data", err)
	}

	privateKeyImported, err := x509.ParsePKCS1PrivateKey(key.Data)
	if err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
	//fmt.Println("Private Key : ", privateKeyImported)
	return privateKeyImported
}


func (cu *CryptoUtil)  writeBinaryIPFSRsaKey(privkey *rsa.PrivateKey, fileName string) error {
	key := &pb.PrivateKey{
		Data: x509.MarshalPKCS1PrivateKey(privkey),
	}
	protobytes, err := proto.Marshal(key)
	if err != nil {
		return err
	}
	err = ioutil.WriteFile(cu.ipfsKeystorePath + "/" + fileName, protobytes, 0644)
	return err
}

func (cu *CryptoUtil)  getIPFSNameFromBinaryRsaKey(fileName string) string {
	// was referring to https://stackoverflow.com/questions/51433889/is-it-possible-to-derive-an-ipns-name-from-an-ipfs-keypair-without-publishing for some of this.
	// but i left out the code that would fall back to a mh.ID algo if the data was too short b/c the data is never going to be that short for these.
	privateKeyFile, err := os.Open(cu.ipfsKeystorePath + "/" + fileName)
	if err != nil {
		fmt.Println(err)
		os.Exit(1)
	}

	pbfileinfo, _ := privateKeyFile.Stat()
	var size int64 = pbfileinfo.Size()
	rawbytes := make([]byte, size)
	buffer := bufio.NewReader(privateKeyFile)
	_, err = buffer.Read(rawbytes)
	ipfsKey, err := ci.UnmarshalPrivateKey(rawbytes)
	checkError(err)

	pubBytes, err := ipfsKey.GetPublic().Bytes()
	checkError(err)
	hash, _ := mh.Sum(pubBytes, mh.SHA2_256, -1)
	peerID := b58.Encode(hash)
	return peerID
}

func (cu *CryptoUtil)  getPeerIDBase58FromPubkey(pubkey *rsa.PublicKey) string {
	//from what I can tell from poking around, ipfs generates the ipns from the pubkey by doing:
	//get pubkey into ipfs pubkey protobuf format (which appears to use MarshalPKIXPublicKey for the pubkey itself) and serialize that protobuf to bytes
	//then does hash of it and b58 encode that.

	pbmes := new(pb.PublicKey)
	pbmes.Type = pb.KeyType_RSA
	data, err := x509.MarshalPKIXPublicKey(pubkey)
	if err != nil { return "" }
	pbmes.Data = data
	pubkeyProtoBytes, err := proto.Marshal(pbmes)
	if err != nil { return "" }

	hash, _ := mh.Sum(pubkeyProtoBytes, mh.SHA2_256, -1)
	peerID := b58.Encode(hash)
	return peerID
}
