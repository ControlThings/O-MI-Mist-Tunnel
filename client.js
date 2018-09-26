var OmiNodeTunnel = require('./src/omiNode.js').OmiNodeTunnel;

var mistOmiTunnel = new OmiNodeTunnel();

// Handle answers
mistOmiTunnel.handleMistOmi = function(msg, peer, cb) {
  console.log("Received from:", peer.userid);
  console.log("Omi return message:", msg);
  cb(true);
}

// Send to peer
var peer = undefined; // TODO
mistOmiTunnel.sendMistOmi(peer, "<data/>");

