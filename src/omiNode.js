const Mist = require('mist-api').Mist;
//const http = require('http');
const WebSocket = require('ws');


// TODO: make more controlled system than automatic identity creation
const DefaultIdentityName = 'o-mi-node';    // wish/mist identity name

function noop() {}


function OmiNodeTunnel(omiNodeWsAddress, tunnelCloseTimeout=1*24*60*60*1000) {
  const mist = new Mist({ name: 'MistApi', corePort: 9094 }); // , coreIp: '127.0.0.1', corePort: 9094

  var omiClients = {
  // remote_peer_id : {
  //   wishPeer: null,       // for sending the o-mi results
  //   ws : null,            // websocket for o-mi communication
  //   sendSuccessCb : null, // callback for notifying about successful o-mi request send (on communication level)
  //   lastContact : Date()  // last contact timestamp for tunnel close timeouts
  // }
  }; 

  var interval;
  if (omiNodeWsAddress != null) {
    // cleanup or ping
    interval = setInterval(function () {
      omiClients.forEach(function each(client) {
        const ws = client.ws;
        const now = Date.now();
        if (now - ws.lastContact > tunnelCloseTimeout) {
          ws.terminate();
          delete omiClients[client.wishPeer.userid];
        }

        ws.ping(noop);
      });

    }, 40000);
  }

  function handleImmediateResponse(err, data) {
    if (err) {
      console.log("[Mist] Error invoking omiHandler:", data);
      return;
    }
    console.log("omiHandler immediate response:", data);
  }

  function sendMistOmi(mistPeer, stringData, immediateResponseCb=handleImmediateResponse) {
    mist.request('mist.control.invoke', [mistPeer, "omi", stringData], immediateResponseCb);
  }


  // wait for wish core
  mist.request('signals', [], (err, data) => {
    console.log(err, data[0]);

    if (data[0] && data[0] === 'ready') {
      if (data[1] === true) {
        setupWishCore(mist); // check own identity or create
      }
    }

    // Test sending to all peers, TODO: remove
    if (data[0] && data[0] === "peers") {
      mist.request('listPeers', [], (err, data) => {
        console.log("listPeers:", data);

        for (var i in data) {
          var peer = data[i];
          sendMistOmi(peer, "<foo/>");
        }
      });
    }
  });

  function createWishUserId(wishPeer) {
    return Buffer.from(wishPeer.ruid).toString('base64');
  }

  function createWsConnection(wishPeer) {
    const userid = wishPeer.userid; //createWishUserId(wishPeer);
    console.log("peer:", wishPeer);
    console.log("BASE64 REMOTE USERID: ", userid);

    const ws = new WebSocket(omiNodeWsAddress, {
        perMessageDeflate: false,
        'Wish-RUID' : userid
    });
    // WS Receiver to send results back to peer
    ws.on('message', function incoming(data) {
      console.log('[O-MI Tunnel] Tunneling data:', data);
      sendMistOmi(wishPeer, data);
    });

    const client = {
      wishPeer: wishPeer,
      ws: ws,
      sendSuccessCb: null,
      lastContact: Date.now()
    };
    omiClients[userid] = client;
    return client;
  }

  // uses `peer` to select right websocket and sends msg
  function sendOmi(msg, peer, cb) {
    const client = omiClients[peer.userid];

    //client.sendSuccessCb = cb;
    client.ws.send(msg, function ack(error) {
      // If error is not defined, the send has been completed, otherwise the error
      if (error != null) {
        console.log("[WS] Error:", error);
        cb(error);
        // TODO: what now?
      } else {
        cb(true);
      }
    });
  }

  // handle omi request at server side
  function handleMistOmi(msg, peer, immediateResponseCb) {
    if (omiClients.hasOwnProperty(peer.userid)) {
      sendOmi(msg, peer, immediateResponseCb);
    } else {
      createWsConnection(peer).ws.on('open', function open(){
        sendOmi(msg, peer, immediateResponseCb);
      });
    }
  }

  // Receiver for omi messages
  mist.node.addEndpoint('omi', {
    type: 'invoke',
    invoke: function(args, peer, cb) {

      /* Do the parsing of 'args' here, and when you are are done, call function cb() passing the reply as a parameter. 
            The cb can be called asynchronously, it need not be inside this invoke handler function. However, you may only send a reply once. */

      peer.userid = createWishUserId(peer);
      console.log("OmiNode's omiHandler got arguments:", args);

      //var post_options = {
      //  host: 'localhost',
      //  port: '8080',
      //  path: '/',
      //  method: 'POST',
      //  headers: {
      //    'Content-Type': 'application/xml',
      //    'Content-Length': Buffer.byteLength(args),
      //    'Wish-RUID' : peer.userid
      //  }
      //};

      //var post_req = http.request(post_options, function(res) {
      //  res.setEncoding('utf8');
      //  res.on('data', function (chunk) {
      //    console.log('Sending Response: ' + chunk);
      //    cb(null, chunk);
      //  });
      //});
      //post_req.write(args);
      //post_req.end();

      // cb(null, "OmiNode's omiHandler responding here!");
      handleMistOmi(args, peer, cb);

      /* By saving the 'peer' object, you can later invoke endpoints on the peer that invoked this endpoint, for example invoke the "omiData" endpoint of the peer to send results of a omi/odf subscription. */
    }
  });
}


/* This function lists the identities in the Wish core, and if there are no identities, a local identity is created. 
 If the local identity has no friends, the core is set to claimable state. */
function setupWishCore(mist) {
  var localUid;
  mist.wish.request('identity.list', [], function(err, data) { 
    var foundLocalId = false;

    
    for (var i in data) {
      if (data[i] && data[i].privkey) {
        /* A local identity was found */
        foundLocalId = true;
        localUid = data[i].uid;
        console.log("localuid", localUid);
      }
    }

    if (!foundLocalId) {
      console.log("There were no local identities in the core, creating one!");
      mist.wish.request("identity.create", [DefaultIdentityName + "'s identity"], (err, data) => {
        if (err) { console.log("Error creating identity!", data); return; }
        console.log("identity.create", data);
        localUid = data.uid;
      });
    }
  });

  //mist.wish.request("signals", [], (err, data) => {
  //    //console.log("Got Wish core signals: ", data);

  //    if (data[0] === "ok") {
  //        // Clear the local discovery cache so that we may get updates on available peers
  //        mist.wish.request("wld.clear", [], (err, data) => { if (err)  { console.log("wld.clear err", data);}});
  //    }

  //    if (data[0] === "localDiscovery") {
  //        mist.wish.request("wld.list", [], (err, data) => { 
  //            //console.log("wld:", data);
  //            for (var i in data) {
  //                if (data[i] && data[i].claim === true) {
  //                    var friendCandidate = data[i];
  //                    mist.wish.request("identity.list", [], (err, data) => {
  //                        console.log("friend req, identity.list", err, data);
  //                        var found = false;
  //                        for (var i in data) {
  //                            if (data[i].uid.equals(friendCandidate.ruid)) {
  //                                console.log("Not sending friendreq to ", friendCandidate.alias);
  //                                found = true;
  //                            }
  //                        }
  //                        if (!found) {
  //                            mist.wish.request("wld.friendRequest", [localUid, friendCandidate.ruid, friendCandidate.rhid], (err, data) => {
  //                                console.log("Friend request sent to:", friendCandidate.alias);
  //                            });
  //                        }
  //                    });
  //                    
  //                }
  //            }
  //        });
  //    }
  //});
}

module.exports = {
  OmiNodeTunnel: OmiNodeTunnel
};
