# WebRTC to ROS2 Image Publisher

This project extends a WebRTC signaling server to publish video stream frames as ROS2 sensor_msgs/Image messages.

## Features

- WebRTC video streaming
- Real-time frame capture from video stream
- ROS2 image publishing to `/camera/image_raw` topic
- Configurable frame rate (1-30 FPS)
- Live status monitoring
- JPEG compressed image format for efficiency

## Prerequisites

1. **Node.js** (v14 or higher)
2. **ROS2** (Humble Hawksbill or compatible)
3. **rclnodejs** dependencies

### ROS2 Setup

Make sure you have ROS2 installed and sourced:

```bash
# Source ROS2 (adjust path as needed)
source /opt/ros/humble/setup.bash

# Verify ROS2 is working
ros2 topic list
```

### rclnodejs Dependencies

Install system dependencies for rclnodejs:

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y python3-dev python3-numpy python3-setuptools

# For building native addons
sudo apt-get install -y build-essential
```

## Installation

1. Navigate to the webrtc-client-server directory:
```bash
cd webrtc-client-server
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

### 1. Start the WebSocket Signaling Server
```bash
npm run server
```
This starts the WebRTC signaling server on port 8090.

### 2. Start the ROS2 Image Publisher Service
```bash
npm run ros2-publisher
```
This starts the ROS2 image publisher service on port 8092.

### 3. Start the React Application
```bash
npm start
```
This starts the React development server on port 3000.

## Usage

1. Open your browser and navigate to `http://localhost:3000`
2. Enter a Drone Socket ID from consol of `WebSocket Signaling Server`
3. Click "Get streaming" to start the WebRTC connection
4. The ROS2 integration will automatically start publishing frames to `/camera/image_raw/compressed`

### ROS2 Topic Information

- **Topic Name**: `/camera/image_raw/compressed`
- **Message Type**: `sensor_msgs/msg/ImageCompressed`
- **Encoding**: `jpeg`
- **Frame ID**: `camera_frame`
- **Default Frame Rate**: 10 FPS (configurable 1-30 FPS)

### Viewing Published Images

You can view the published images using ROS2 tools:

```bash
# List topics
ros2 topic list

# View topic info
ros2 topic info /camera/image_raw

# Echo messages (will show metadata)
ros2 topic echo /camera/image_raw

# View images with rqt_image_view
ros2 run rqt_image_view rqt_image_view
```

### Using with image_view

To decompress and view JPEG images:

```bash
# Install image_view if not available
sudo apt-get install ros-humble-image-view

# View the compressed images
ros2 run image_view image_view --ros-args --remap image:=/camera/image_raw
```

## Configuration

### Frame Rate
You can adjust the frame rate in the UI (1-30 FPS) or modify the default in the code.

### Topic Name
To change the topic name, modify the `ros2ImagePublisher.js` file:

```javascript
// In ros2ImagePublisher.js
this.publisher = this.node.createPublisher('sensor_msgs/msg/Image', '/your/custom/topic');
```

### Image Encoding
The current implementation uses JPEG encoding for efficiency. To use raw RGB data:

1. Modify `ROS2ImageStreamer.js` to use `canvas.getImageData()`
2. Update `ros2ImagePublisher.js` to handle raw pixel data
3. Change encoding to 'rgb8' or 'bgr8'

## Troubleshooting

### ROS2 Service Won't Start
- Ensure ROS2 is sourced: `source /opt/ros/humble/setup.bash`
- Check if rclnodejs dependencies are installed
- Verify Node.js version compatibility

### No Images Published
- Check if both WebSocket servers are running (ports 8090 and 8091)
- Verify the video stream is active in the browser
- Check browser console for WebSocket connection errors

### Connection Issues
- Ensure all services are running on correct ports
- Check firewall settings
- Verify WebSocket connections in browser developer tools

## Development

### File Structure
```
webrtc-client-server/
├── src/
│   ├── App.js                    # Main React component with ROS2 controls
│   ├── WebRTCManager.js          # WebRTC management with ROS2 integration
│   └── ROS2ImageStreamer.js      # Frame capture and WebSocket communication
├── server/
│   ├── index.js                  # WebRTC signaling server
│   └── ros2ImagePublisher.js     # ROS2 image publisher service
└── package.json                  # Dependencies and scripts
```

### Adding Features
- Modify frame capture rate or quality in `ROS2ImageStreamer.js`
- Add additional ROS2 message types in `ros2ImagePublisher.js`
- Enhance UI controls in `App.js`

c
