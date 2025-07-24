import {useRef, useState, useEffect} from 'react';
import {Button, Typography, Input, Switch, Slider, Card, Badge} from 'antd';
import styles from './styles/App.module.css'
import * as log from 'loglevel';
import { DroneStreamManager } from './WebRTCManager'; // Adjust the import path as needed

const {Title, Paragraph, Text} = Typography;

const URL_WEB_SOCKET = 'ws://localhost:8090';
let localStream;

// log.setLevel("DEBUG");

function App() {
    const [callButtonDisabled, setCallButtonDisabled] = useState(true);
    const [hangupButtonDisabled, setHangupButtonDisabled] = useState(true);
    const [videoTagId, ] = useState('droneStreamOut');
    const [droneSocketID, setDroneSocketID] = useState('');
    const [ros2Enabled, setRos2Enabled] = useState(true);
    const [ros2FrameRate, setRos2FrameRate] = useState(10);
    const [ros2Status, setRos2Status] = useState('disconnected');
    const ws = useRef(null);
    let socketSet = false;

    useEffect(() => {
        const wsClient = new WebSocket(URL_WEB_SOCKET);
        ws.current = wsClient;

        wsClient.onopen = () => {
            log.debug('ws opened');
            setCallButtonDisabled(false);
            setHangupButtonDisabled(true);
        };

        wsClient.onclose = () => log.debug('ws closed');

        return () => {
            wsClient.close();
        };
    }, []);


    const callOnClick = () => {
        log.debug('callOnClick invoked');
        if (!droneSocketID) {
            log.error('droneSocketID is empty');
            alert('Drone Socket ID is empty');
            return;
        }
        if (!socketSet) {
            DroneStreamManager.setupSocketEvent(ws.current, droneSocketID);
            socketSet = true;
        }
        localStream = DroneStreamManager.createDroneStream(droneSocketID, videoTagId);
        setCallButtonDisabled(true);
        setHangupButtonDisabled(false);
        localStream.startDroneStream();
        
        // Monitor ROS2 connection status
        if (ros2Enabled) {
            setTimeout(() => {
                checkRos2Status();
            }, 2000);
        }
    };

    const hangupOnClick = () => {
        log.debug('hangupOnClick invoked');
        DroneStreamManager.closeDroneStream(droneSocketID);
        setHangupButtonDisabled(true);
        setCallButtonDisabled(false);
        setRos2Status('disconnected');
    };

    const checkRos2Status = () => {
        try {
            const stream = DroneStreamManager.getStreamByDroneID(droneSocketID);
            if (stream && stream.ros2Streamer) {
                const status = stream.ros2Streamer.getConnectionStatus();
                setRos2Status(status);
                
                if (status === 'connected' && stream.ros2Streamer.isStreaming) {
                    setRos2Status('streaming');
                }
            }
        } catch (error) {
            setRos2Status('error');
        }
    };

    const onRos2FrameRateChange = (value) => {
        setRos2FrameRate(value);
        
        try {
            const stream = DroneStreamManager.getStreamByDroneID(droneSocketID);
            if (stream && stream.ros2Streamer) {
                stream.ros2Streamer.setFrameRate(value);
            }
        } catch (error) {
            console.log('No active stream to update frame rate');
        }
    };

    const getRos2StatusColor = () => {
        switch (ros2Status) {
            case 'connected':
            case 'streaming':
                return 'success';
            case 'connecting':
                return 'processing';
            case 'error':
                return 'error';
            default:
                return 'default';
        }
    };

    const renderHelper = () => {
      return (
          <div className={styles.wrapper}>
              <Input
                  placeholder="Drone Socket ID"
                  style={{width: 240, marginTop: 16}}
                  value={droneSocketID}
                  onChange={(event) => {
                      setDroneSocketID(event.target.value);
                  }}
              />
              <Button
                  onClick={callOnClick}
                  style={{width: 240, marginTop: 16}}
                  type="primary"
                  disabled={callButtonDisabled}
              >
                  Get streaming
              </Button>
              <Button
                  danger
                  onClick={hangupOnClick}
                  style={{width: 240, marginTop: 16}}
                  type="primary"
                  disabled={hangupButtonDisabled}
              >
                  Hangup
              </Button>
          </div>
      );
  };

  const renderRos2Controls = () => {
      return (
          <Card 
              title="ROS2 Image Publisher" 
              style={{width: 300, marginTop: 16}}
              size="small"
          >
              <div style={{marginBottom: 16}}>
                  <Text strong>Status: </Text>
                  <Badge 
                      status={getRos2StatusColor()} 
                      text={ros2Status.charAt(0).toUpperCase() + ros2Status.slice(1)}
                  />
              </div>
              
              <div style={{marginBottom: 16}}>
                  <Text strong>Enable ROS2 Publishing: </Text>
                  <Switch 
                      checked={ros2Enabled}
                      onChange={setRos2Enabled}
                      disabled={!hangupButtonDisabled}
                  />
              </div>
              
              <div style={{marginBottom: 8}}>
                  <Text strong>Frame Rate: {ros2FrameRate} FPS</Text>
              </div>
              <Slider
                  min={1}
                  max={30}
                  value={ros2FrameRate}
                  onChange={onRos2FrameRateChange}
                  disabled={!hangupButtonDisabled}
              />
              
              <div style={{marginTop: 16, fontSize: '12px', color: '#666'}}>
                  <Text>Topic: /camera/image_raw</Text><br/>
                  <Text>Encoding: jpeg</Text><br/>
                  <Text>Frame ID: camera_frame</Text>
              </div>
          </Card>
      );
  };

  return (
      <div className={styles.App}>
          <div className={styles['App-header']}>
              <Title>WebRTC with ROS2 Integration</Title>
              <Paragraph>
                  This demo shows how to stream WebRTC video and publish frames to ROS2 as sensor_msgs/Image messages.
              </Paragraph>
              <div className={styles['wrapper-row']} style={{justifyContent: 'space-evenly', width: '80%'}}>
                  {renderHelper()}
                  {renderRos2Controls()}
              </div>
              <div
                  className={styles.playerContainer}
                  id="playerContainer"
              >
                  <video
                      id={videoTagId}
                      autoPlay
                      style={{width: 640, height: 480}}
                  />
              </div>
          </div>
      </div>
  );
}

export default App;
