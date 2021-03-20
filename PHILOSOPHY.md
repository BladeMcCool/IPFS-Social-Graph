### Motivation  
  
To be able to communicate freely without having terms imposed. The intent is to build an ecosystem.  

### Proof of Concept  
  
This is an experimental proof of concept, to verify if the idea works and if IPFS delivers on its promises. It has also been written in haste, as time is apparently of the essence.
  
### Own your data  
  
If you run this and point it at an IPFS node that you control, then you own and control your data, up to the point that you give a copy of it freely to others, who may choose to archive it indefinitely. Anything you do or say on this social graph may stick around to haunt you. Protect your private key, it is your identity. If you lose it, you can no longer update your profile or social graph. If it is compromised, there is no authority which can intervene.  
  
### RSA Cryptography (Sign/Verify primarily)  
  
Your identity is an RSA public key, which is derived from a RSA private key. When you wish to publish updates, your private key will be used locally in the browser to sign messages that are also published by js-ipfs in the browser. At the moment all post creation is done in cleartext but I see no reason why future developments could not use similar/same RSA keys to encrypt messages intended only for certain recipients.  
  
### IPNS Publish limitations and security of Private Key  
  
From my experience the js-ipfs library is not able to push our IPNS published records in a way that other IPFS nodes on the internet are able to resolve the names. In order for the server to publish an IPNS name on your behalf using your own peerId you are required to send the private key to the server. This is incredibly insecure, and IPNS publish is too slow to allow this. So, the alternative is IPNS Delegated Federation, where the server will publish a list of profileId social graph tips on behalf of all clients in a single large list, and collect similar lists from other servers in the federation.  
  
### Notes on Anonymity   
Your anonymity is up to you. I have made no effort to put services behind Tor or I2P or whatever. I have made no effort to encrypt any of the text produced by this code to be stored in IPFS. If you are under threat by powerful entities then you will need to take your own steps to shroud your communication with this system. Technically the only identifying information that a server requires to process your request is a whitelisted public RSA key. I would think that accessing this service via a Tor exit should sufficiently obfuscate your traffic origin.  
 
### TODOs / ideas for the future   
 - ~~Improve UI, ux, layout/design etc as well as the possibility to make use of the js-ipfs library to load cid data and move timeline assembly code from the server to the browser, which could make the experience much more dynamic!~~ [Implemented a much better UI than initial release!]  
  
 - Delete / ~~Retract posts.~~ [Impl] Since the history is published to anyone who cares to crawl it, there is no real concept of being able to permanently delete something however it should be trivial to republish your entire profile history back to the beginning and just leave out anything that you want to 'go away' from your current official timeline of posts. ~~A retraction would operate not by trying to rewrite history but instead by adding a new entry flagging an old one as retracted.~~ [Now Implemented] 'Edits' to existing posts could be published in a similar fashion just by using diffs and leave it to client code to assemble the current rendition of the text.
  
 - ~~Federation of IPNS delegates. basically you'd just list peerIds of the federation members (peer id of their 'IPNS delegate' key) you want to join with, and it will collect all the profileid tip info published by the collective membership.~~ [Now implemented -- including pubsub enhancement ]  
  
 - ~~Repost function, which would be a profile making a post that references another post, this would let profiles in your graph expose you to profiles that are outside of it.~~ [Now implemented]
   
 - ~~'Follow' button for the profileId shown in these reposts. The server would need to go collect profile info to present a display name etc on the reposted content, but could allow it to appear without that too i suppose.~~ [Now implemented]   
  
 - Likes - which by the nature of the system would only be able to count up a total of likes done to your content by people in your social graph.  
  
 - Groups / "Curated Feeds" - likely requiring new data structure. Haven't put too much thought into it, but a hierarchy of profileIds could have authority to publish the canonical official history of a given group, thus allowing them moderation power to disappear posts in the group as desired.  
  
 - Blacklisting services with blacklist of post content cids. Multiple blacklists could be subscribed to, it would just put all the cids on one master block list. Could manually exclude things of interest if the subscribed block lists are too aggressive.  
  
 - "Verification" services which would require some kind of identification vetting process and then be willing to sign off on some profileId as being "verified". Different levels and quality of verification can be provided by different providers and it would be up to the clients which verification services they want to trust the opions of and to what degree.
 
 - Timestamp oracles, as right now the timestamps on posts are self generated and could claim to be from the future or the past. The graphnode sequencing and reply inter-relations between graph chains will currently provide some relative time meta info, but having a recognized service available which could add its signature of validity to specific post timestamps could provide better assurances for correct message ordering in a timeline display.
 
 - Moderation subscription? you would not see any new content until it had been approved by a moderation team/group of your choosing. 
  
 - Centralized portals? Where you would retain your private key for signing things in the browser client but the timeline presented to you is curated or managed by a service with terms. If you were unhappy with those terms at any point you could just go use an independent client or a different centralized portal using your keys. Centralized portals could even offer you the sacrifice of managing your keys for you, at the expense of you no longer truly owning your data. However for some people, this may be close to the the desired experience. Such centralized platforms could also possibly offer monetization paths.  
  
### Inspirational References  
  
https://beyermatthias.de/blog/2017/10/31/blueprint-of-a-distributed-social-network-on-ipfs---and-its-problems/  
https://carter.sande.duodecima.technology/decentralized-wishlist/  
Plus the writings of Larry Sanger and others.  
  
### Special Thanks to
   Matthias Beyer - For writing his blog post, helping me realize I'm not the first person to think of this (seemingly obvious) solution to the problem, and for thinking of a bunch of stuff that I was not.
   
   Larry Sanger - For inspiration to actually do something.
   
   Ian Crossland and Tim Pool - For constantly complaining about the lack of something like this existing
   
   Kibbychan - For putting up with all my bullshit. 

### Support libraries, standing on the shoulders of giants
 None of this would be possible without the following critical libraries and apis which this project relies on
   - go-ipfs
   - go libp2p
   - js-ipfs
   - crypto.subtle
   - js libp2p
   - localforage
   - stablejson
   - jdenticon
   - moment.js
   
   and so many more. 

### Story Time  
  
An idea occurred to me to have a chain of posts that could be crawled back to its origin, and that posts within that chain could reference existing posts in other chains, creating a sort of interlinked DAG of social graph, and that this could be published on top of IPFS for distribution and be secured by RSA crypto keys for pubkey identity and message signing. I wanted to see if this could work so I built this proof of concept.  
  
The main two data structures in this are the GraphNodes and the Profiles. They link to each other and create a history. Each time a profile wants to publish new content it has to update its social graph tip information for its profile so that the latest content can be found, and that new update will link back to prior content.   
  
I wanted a profile identity to be an RSA public key and to use digital signatures to verify the content is created by the claimed profile owner. I understood that IPNS would be a way to keep the social graph tip up to date, but encountered a problem in doing so via the js-ipfs library in-browser, related to dht support, and thus the motivation for the server component.  
  
The server is intended to allow you to publish IPNS updates and otherwise cache profile tip information when being used by authorized clients. Unfortunately to be able to publish IPNS under your own private key, it has to be sent to the server. Since that is effectively unacceptable, I have implemented some ideas for a federated listing service that can provide the required information to keep clients of participating servers up to date.  
  
There is a minimal proof of concept UI as well as some web server methods built around serving that ui. This ui allows you to generate RSA private key in the browser and use it to sign and publish messages into IPFS directly from the browser using js-ipfs. It will also send a signed update of profile tip information to the server for it to publish in its IPNS delegated listings and server-to-server pubsub for federated information sharing.   
    
