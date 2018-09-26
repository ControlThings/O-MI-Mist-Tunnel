var OmiNodeTunnel = require('./src/omiNode.js').OmiNodeTunnel;

// Settings, for tunnel server-side
const OmiNodeWsAddress = 'ws://localhost:8080/'; // o-mi node address
const TunnelCloseTimeout = 1*24*60*60 *1000; // ms, to close tunnel after this amount of silence

var mistOmiNode = new OmiNodeTunnel(OmiNodeWsAddress, TunnelCloseTimeout);

