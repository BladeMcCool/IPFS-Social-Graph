peerutil = require('./peerutil')
async function go() {
    peerid = await peerutil.peerid("MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6BhEYJN+X7ESg9HOZODnx9xVxi3DelgBm37oA9PsrU8wgw4jHwffGL7kn/hyCbbGvgL4a/lCA6FmLWgAVI1g8TmMB083Aa9Sexty2tfKta0fa/D9wjt2/pzH+JvAMaixjnKjIPmUTpEHmCN4iiSMUqLd3lWmvygF71Lh3Kf6UpCoziUqKwBIxWU7sxg2WBT7D6YF6TRDfWT46ES0GKZbAntie2GMngxnXAo/Ccov1zhXgxD4j4CXEhoSxY1jJG17UK/mlNAu7/7jwizBIlwtLVAaNvN8DHy5yc2tuigHWsQ4ps4ySjbSTbnGp3RsEGTNFYhtZlhvfbPYG6Eq4e/wLQIDAQAB")
    console.log(peerid)
}
go()
