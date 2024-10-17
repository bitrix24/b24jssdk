const protobuf = window.protobuf


// Protobuf message models
const Response = protobuf.roots['push-server']['Response']
const ResponseBatch = protobuf.roots['push-server']['ResponseBatch']
const Request = protobuf.roots['push-server']['Request']
const RequestBatch = protobuf.roots['push-server']['RequestBatch']
const IncomingMessagesRequest = protobuf.roots['push-server']['IncomingMessagesRequest']
const IncomingMessage = protobuf.roots['push-server']['IncomingMessage']
const Receiver = protobuf.roots['push-server']['Receiver']


export default {
	Response,
	ResponseBatch,
	Request,
	RequestBatch,
	IncomingMessagesRequest,
	IncomingMessage,
	Receiver,
}