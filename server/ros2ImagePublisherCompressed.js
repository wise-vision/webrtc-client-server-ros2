const rclnodejs = require('rclnodejs');
const WebSocket = require('ws');

class ROS2ImagePublisherCompressed {
    constructor() {
        this.node = null;
        this.publisher = null;
        this.isInitialized = false;
        this.wss = null;
        this.isProcessing = false;
        this.frameDropCount = 0;
        this.lastProcessTime = 0;
        this.lastPublishTime = 0;
        this.minPublishInterval = 100; // Minimum 100ms between publishes (10 FPS max)
    }

    async initialize() {
        try {
            // Initialize ROS2
            await rclnodejs.init();
            
            // Create a ROS2 node
            this.node = new rclnodejs.Node('webrtc_compressed_image_publisher');
            
            // Create COMPRESSED image publisher with BEST EFFORT QoS and smaller queue
            const qos = {
                durability: rclnodejs.QoS.DurabilityPolicy.VOLATILE,
                reliability: rclnodejs.QoS.ReliabilityPolicy.BEST_EFFORT,
                history: rclnodejs.QoS.HistoryPolicy.KEEP_LAST,
                depth: 1 // Keep only the latest frame to prevent queue buildup
            };
            
            // Publish compressed image instead of raw RGB
            this.publisher = this.node.createPublisher('sensor_msgs/msg/CompressedImage', '/camera/image_raw/compressed', qos);
            
            console.log('ROS2 Compressed Image Publisher initialized successfully');
            console.log('Publishing to topic: /camera/image_raw/compressed');
            
            this.isInitialized = true;
            
            // Start spinning the node
            rclnodejs.spin(this.node);
            
        } catch (error) {
            console.error('Failed to initialize ROS2:', error);
            throw error;
        }
    }

    setupWebSocketServer(port = 8092) {
        this.wss = new WebSocket.Server({ port });
        
        console.log(`WebSocket server for compressed image frames listening on port ${port}`);
        
        this.wss.on('connection', (ws) => {
            console.log('Client connected to compressed image publisher WebSocket');
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    
                    if (message.type === 'image_frame') {
                        // Process frame asynchronously to avoid blocking WebSocket
                        setImmediate(() => {
                            this.publishCompressedImageFrame(message.data);
                        });
                    }
                } catch (error) {
                    console.error('Error processing WebSocket message:', error);
                }
            });
            
            ws.on('close', () => {
                console.log('Client disconnected from compressed image publisher WebSocket');
            });
            
            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });
        });
    }

    async publishCompressedImageFrame(frameData) {
        if (!this.isInitialized || !this.publisher) {
            console.warn('ROS2 not initialized, skipping frame publication');
            return;
        }

        const now = Date.now();
        
        // Rate limiting: Skip frame if we published too recently
        if (now - this.lastPublishTime < this.minPublishInterval) {
            this.frameDropCount++;
            console.log(`⚠️ Frame dropped (${this.frameDropCount} total) - rate limited`);
            return;
        }

        // Drop frame if still processing previous frame (non-blocking)
        if (this.isProcessing) {
            this.frameDropCount++;
            console.log(`⚠️ Frame dropped (${this.frameDropCount} total) - still processing`);
            return;
        }

        this.isProcessing = true;
        this.lastPublishTime = now;
        const startTime = Date.now();

        try {
            // Use dimensions from frameData
            const width = frameData.width;
            const height = frameData.height;
            
            // Decode base64 to buffer - this is the JPEG data
            const jpegBuffer = Buffer.from(frameData.imageData, 'base64');
            
            // Create compressed image message - much faster!
            const compressedImageMsg = {
                header: {
                    stamp: {
                        sec: Math.floor(now / 1000),
                        nanosec: (now % 1000) * 1e6
                    },
                    frame_id: 'camera_frame'
                },
                format: 'jpeg',
                data: Array.from(jpegBuffer) // Direct JPEG data, no conversion needed!
            };

            // Publish immediately - no image processing needed!
            this.publisher.publish(compressedImageMsg);
            
            const processingTimeMs = Date.now() - startTime;
            this.lastProcessTime = processingTimeMs;
            
            // Calculate latency
            let latencyMs = 'unknown';
            if (frameData.captureTime) {
                latencyMs = now - frameData.captureTime;
            } else if (frameData.timestamp) {
                latencyMs = now - frameData.timestamp;
            }
            
            console.log(`✅ Published compressed ${width}x${height} in ${processingTimeMs}ms, latency: ${latencyMs}ms, size: ${jpegBuffer.length}B (dropped: ${this.frameDropCount})`);
            
        } catch (error) {
            console.error('❌ Error publishing compressed image frame:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    async shutdown() {
        console.log('Shutting down ROS2 Compressed Image Publisher...');
        
        if (this.wss) {
            this.wss.close();
        }
        
        if (this.node) {
            this.node.destroy();
        }
        
        await rclnodejs.shutdown();
        console.log('ROS2 Compressed Image Publisher shutdown complete');
    }

    resetStats() {
        this.frameDropCount = 0;
        this.lastProcessTime = 0;
        this.lastPublishTime = 0;
        console.log('Statistics reset');
    }

    setPublishRate(fps) {
        this.minPublishInterval = Math.max(33, 1000 / fps); // Minimum 30 FPS, maximum as requested
        console.log(`Publish rate set to ${fps} FPS (${this.minPublishInterval}ms interval)`);
    }

    getStats() {
        return {
            frameDropCount: this.frameDropCount,
            lastProcessTime: this.lastProcessTime,
            isProcessing: this.isProcessing,
            publishRate: Math.round(1000 / this.minPublishInterval),
            minPublishInterval: this.minPublishInterval
        };
    }
}

// Main execution
async function main() {
    const publisher = new ROS2ImagePublisherCompressed();
    
    try {
        await publisher.initialize();
        publisher.setupWebSocketServer(8092);
        
        console.log('ROS2 Compressed Image Publisher service is running...');
        console.log('WebSocket server listening on port 8092');
        console.log('Publishing compressed images to topic: /camera/image_raw/compressed');
        
    } catch (error) {
        console.error('Failed to start ROS2 Compressed Image Publisher:', error);
        process.exit(1);
    }
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nReceived SIGINT, shutting down gracefully...');
        await publisher.shutdown();
        process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
        console.log('\nReceived SIGTERM, shutting down gracefully...');
        await publisher.shutdown();
        process.exit(0);
    });
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ROS2ImagePublisherCompressed;
