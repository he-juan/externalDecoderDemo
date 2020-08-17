
var getMediaButton = document.querySelector('button#getMedia');
var connectButton = document.querySelector('button#connect');
var hangupButton = document.querySelector('button#hangup');

var decoderImplementationDiv = document.getElementById('decoderImplementation')
var encoderImplementationDiv = document.getElementById('encoderImplementation')
var local_googCodecName = document.getElementById('local_googCodecName')
var remote_googCodecName = document.getElementById('remote_googCodecName')
var local_bytesSent = document.getElementById('local_bytesSent')
var remote_bytesReceived = document.getElementById('remote_bytesReceived')
var statisticsInterval = null

var localVideo = document.querySelector('div#localVideo video');
var remoteVideo = document.querySelector('div#remoteVideo video');
var localVideoStatsDiv = document.querySelector('div#localVideo div');
var remoteVideoStatsDiv = document.querySelector('div#remoteVideo div');
var localPeerConnection;
var remotePeerConnection;
var localStream;
var constraints ={
    audio: true,
    video: {
        width: { max: '1920' },
        height: { max: '1080' },
        frameRate: { max: '5' }
    }
};
var targetPresentStream = null;


function getMedia() {
    console.warn('GetUserMedia start!');
    getMediaButton.disabled = true;
    if (localStream) {
        localStream.getTracks().forEach(function(track) {
            track.stop();
        });
        var videoTracks = localStream.getVideoTracks();
        for (var i = 0; i !== videoTracks.length; ++i) {
            videoTracks[i].stop();
        }
    }
    console.warn('getDisplayMedia constraints: \n', JSON.stringify(constraints, null, '    '));

    if('getDisplayMedia' in window.navigator){
        navigator.getDisplayMedia(constraints)
            .then(gotStream)
            .catch(function(e) {
                console.error(e)
                console.warn("getUserMedia failed!");
                var message = 'getUserMedia error: ' + e.name + '\n' +
                    'PermissionDeniedError may mean invalid constraints.';
                alert(message);
                console.log(message);
                getMediaButton.disabled = false;
            });
    }else if('getDisplayMedia' in window.navigator.mediaDevices){
        navigator.mediaDevices.getDisplayMedia(constraints)
            .then(gotStream)
            .catch(function(e) {
                console.error(e);
                var message = 'getUserMedia error: ' + e.name + '\n' +
                    'PermissionDeniedError may mean invalid constraints.';
                alert(message);
                console.log(message);
                getMediaButton.disabled = false;
            });
    }else {
        var screen_constraints = {
            audio: false,
            video: {
                mozMediaSource: 'screen',
                mediaSource: 'screen',
                width: {min: '10',max: '1920'},
                height: {min: '10',max: '1080'},
                frameRate: {min: '1', max: '5'}
            }
        };
        navigator.mediaDevices.getUserMedia(screen_constraints).then(gotStream).catch(function (e) {
            console.error(e);
            var message = 'getUserMedia error: ' + e.name + '\n' + 'PermissionDeniedError may mean invalid constraints.';
            alert(message);
            console.log(message);
            getMediaButton.disabled = false;
        })

        console.warn("该浏览器不支持getDisplayMedia接口");
    }
}


function gotStream(stream) {
    connectButton.disabled = false;
    console.warn('GetUserMedia succeeded:');
    localStream = stream;
    localVideo.srcObject = stream;

    stream.oninactive = function(){
        console.warn("stream oninactive !!!!!!!!!!")
    }

    localStream.oninactive = function () {
        console.warn("localStream oninactive !!!!!!!")
    }

    // Fixed stream.oninactive is not aways trigger when system audio sharing
    localStream.getTracks().forEach(function (track) {
        track.onended = function () {
            localStream.getTracks().forEach(function (mediaTrack) {
                if(mediaTrack.readyState !== 'ended'){
                    console.warn('stop track');
                    mediaTrack.stop()
                }
            })
        }
    })
}

function createPeerConnection() {
    console.log("begin create peerConnections");
    console.log(localStream);
    connectButton.disabled = true;
    hangupButton.disabled = false;

    localPeerConnection = new RTCPeerConnection(null);
    remotePeerConnection = new RTCPeerConnection(null);
    localStream.getTracks().forEach(function(track) {
            console.log("localPeerConnection addTack!");
            localPeerConnection.addTrack(track, localStream);
        }
    );
    console.log('localPeerConnection creating offer');
    localPeerConnection.onnegotiationeeded = function() {
        console.log('Negotiation needed - localPeerConnection');
    };
    remotePeerConnection.onnegotiationeeded = function() {
        console.log('Negotiation needed - remotePeerConnection');
    };
    localPeerConnection.onicecandidate = function(e) {
        console.log('Candidate localPeerConnection');
        remotePeerConnection.addIceCandidate(e.candidate).then(onAddIceCandidateSuccess, onAddIceCandidateError);
    };
    remotePeerConnection.onicecandidate = function(e) {
        console.log('Candidate remotePeerConnection');
        localPeerConnection.addIceCandidate(e.candidate).then(onAddIceCandidateSuccess, onAddIceCandidateError);
    };
    remotePeerConnection.ontrack = function(e) {
        console.warn("localPeerConnection iceConnectionState: ", localPeerConnection.iceConnectionState)
        console.warn("remotePeerConnectioniceConnectionState: ", remotePeerConnection.iceConnectionState)
        if (remoteVideo.srcObject !== e.streams[0]) {
            console.log('remotePeerConnection got stream');
            remoteVideo.srcObject = e.streams[0];
            targetPresentStream = e.streams[0]
        }
    };
    localPeerConnection.createOffer().then(
        function(desc) {
            console.log('localPeerConnection offering');
            localPeerConnection.setLocalDescription(desc);

            desc.sdp = setMediaBitrateAndCodecPrioritys(desc.sdp);
            console.log(`Offer from pc1 ${desc.sdp}`);
            desc.sdp = dealWithSdp(desc)
            remotePeerConnection.setRemoteDescription(desc);
            remotePeerConnection.createAnswer().then(
                function(desc2) {
                    console.log('remotePeerConnection answering');
                    console.warn(`Answer from pc2:\n${desc2.sdp}`);
                    remotePeerConnection.setLocalDescription(desc2);
                    desc2.sdp = setMediaBitrateAndCodecPrioritys(desc2.sdp);
                    desc2.sdp = dealWithSdp(desc2)
                    console.warn('remote Answer pc2:',desc2.sdp.toString());
                    localPeerConnection.setRemoteDescription(desc2);
                },
                function(err) {console.log(err);}
            );
        },
        function(err) {
            console.log(err);
        }
    );

    P2PStatistics()
}

function P2PStatistics() {
    // Display statistics
    statisticsInterval = setInterval(function() {
        if (localPeerConnection && remotePeerConnection) {
            remotePeerConnection.getStats(null)
                .then(showRemoteStats, function(err) {
                    console.log(err);
                });
            localPeerConnection.getStats(null)
                .then(showLocalStats, function(err) {
                    console.log(err);
                });
        } else {
            // console.log('Not connected yet');
        }
        // Collect some stats from the video tags.
        if (localVideo.videoWidth) {
            localVideoStatsDiv.innerHTML = '<strong>Video dimensions:</strong> ' +
            localVideo.videoWidth + 'x' + localVideo.videoHeight + 'px';
        }
        if (remoteVideo.videoWidth) {
            remoteVideoStatsDiv.innerHTML = '<strong>Video dimensions:</strong> ' +
            remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight + 'px';
        }
    }, 1000);
}

/**
 * 发送端
 * @param results
 */
function showLocalStats(results) {
    results.forEach(function(report) {
        if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
            // debugger
            if(report.encoderImplementation){
                // console.warn("decoderImplementation： ", report.decoderImplementation)
                encoderImplementationDiv.innerHTML =  '<strong>decoderImplementation:</strong> ' + report.encoderImplementation;
            }
            if(report.bytesSent){
                local_bytesSent.innerHTML = '<strong>bytesSent:</strong> ' + report.bytesSent;
            }
        }
    });
}

/**
 * 接收端
 * @param results
 */
function showRemoteStats(results) {
    // calculate video bitrate
    results.forEach(function(report) {
        if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
            if(report.decoderImplementation){
                // console.warn("decoderImplementation： ", report.decoderImplementation)
                decoderImplementationDiv.innerHTML =  '<strong>decoderImplementation:</strong> ' + report.decoderImplementation;
            }
            if(report.bytesReceived){
                remote_bytesReceived.innerHTML = '<strong>bytesReceived:</strong> ' + report.bytesReceived;
            }
        }
    });
}

function dealWithSdp(desc){
    console.log("处理SDP")
    let parsedSdp = SDPTools.parseSDP(desc.sdp)
    for(let i = 0; i < parsedSdp.media.length; i++){
        if(parsedSdp.media[i].type == 'video') {
            let codec = ['VP9','VP8']
            console.warn("删除VP8、VP9编码")
            SDPTools.removeCodecByName(parsedSdp, i, codec)
            // SDPTools.setXgoogleBitrate(parsedSdp, ASBitrate, i)
            SDPTools.removeRembAndTransportCC(parsedSdp, i)
            console.warn("修改后的SDP:",parsedSdp)

            /*修改level-id*/
            var profile_Idc = document.getElementById('profileIdc').value;
            var profile_Iop = document.getElementById('profileIop').value;
            console.warn("profile_idc:",profile_Idc)
            console.warn("profile_iop:",profile_Iop)
            if(!profile_Iop && !profile_Idc){
                console.warn("empty string")
                return
            }

            SDPTools.modifyProfilelevelId(parsedSdp,i,profile_Idc,profile_Iop)

            /**修改方向*/
            // SDPTools.modifyVideoDirection(parsedSdp,i)

            /**修改packetization-mode*/
            SDPTools.modifyPacketizationMode(parsedSdp,i)
        }
    }
    desc.sdp = SDPTools.writeSDP(parsedSdp)
    // console.warn("11:",desc.sdp)
    return  desc.sdp
}


function onAddIceCandidateSuccess() {
    console.log('AddIceCandidate success.');
}

function onAddIceCandidateError(error) {
    console.log('Failed to add Ice Candidate: ' + error.toString());
}

/**
 * 挂断
 */
function hangup() {
    console.log('Ending call');
    localPeerConnection.close();
    remotePeerConnection.close();

    // query stats one last time.
    Promise.all([
        remotePeerConnection.getStats(null)
            .then(showRemoteStats, function(err) {
                console.log(err);
            }),
        localPeerConnection.getStats(null)
            .then(showLocalStats, function(err) {
                console.log(err);
            })
    ]).then(() => {
        localPeerConnection = null;
        remotePeerConnection = null;
    });

    localStream.getTracks().forEach(function(track) {
        track.stop();
    });
    localStream = null;

    hangupButton.disabled = true;
    getMediaButton.disabled = false

    clearInterval(statisticsInterval)
    clearInterval(P2PStatisticsInterval)
    // window.location.reload();
}
