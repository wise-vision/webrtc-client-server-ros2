import * as log from 'loglevel';

/**
 * ROS2ImageStreamer handles capturing video frames and sending them to ROS2 publisher service
 */
export class ROS2ImageStreamer {
    constructor(videoElement, websocketUrl = 'ws://localhost:8092') {
        this.videoElement = videoElement;
        this.websocketUrl = websocketUrl;
        this.ws = null;
        this.canvas = null;
        this.context = null;
        this.isStreaming = false;
        this.frameRate = 8; // Reduced to 8 FPS to match server rate limiting
        this.intervalId = null;
        this.lastFrameTime = 0;
        this.frameDropCount = 0;
        
        // Performance settings
        this.scaleFactor = 0.5; // 50% scaling
        this.quality = 0.3; // 30% JPEG quality
        
        this.setupCanvas();
    }

    setupCanvas() {
        // Create a hidden canvas for frame capture
        this.canvas = document.createElement('canvas');
        this.canvas.style.display = 'none';
        this.context = this.canvas.getContext('2d');
        document.body.appendChild(this.canvas);
    }

    async connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.websocketUrl);
                
                this.ws.onopen = () => {
                    log.debug('Connected to ROS2 image publisher WebSocket');
                    resolve();
                };
                
                this.ws.onerror = (error) => {
                    log.error('WebSocket connection error:', error);
                    reject(error);
                };
                
                this.ws.onclose = () => {
                    log.debug('Disconnected from ROS2 image publisher WebSocket');
                    this.isStreaming = false;
                };
                
            } catch (error) {
                reject(error);
            }
        });
    }

    startStreaming(frameRate = 8) {
        if (this.isStreaming) {
            log.warn('Already streaming to ROS2');
            return;
        }

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            log.error('WebSocket not connected. Call connect() first.');
            return;
        }

        if (!this.videoElement) {
            log.error('Video element not found');
            return;
        }

        this.frameRate = frameRate;
        this.isStreaming = true;
        this.lastFrameTime = 0;
        this.frameDropCount = 0;
        
        log.info(`Starting ROS2 image streaming at ${frameRate} FPS`);
        
        const captureInterval = 1000 / frameRate; // Convert FPS to milliseconds
        
        this.intervalId = setInterval(() => {
            this.captureAndSendFrame();
        }, captureInterval);
    }

    stopStreaming() {
        if (!this.isStreaming) {
            return;
        }

        log.info('Stopping ROS2 image streaming');
        
        this.isStreaming = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    captureAndSendFrame() {
        if (!this.isStreaming || !this.videoElement || !this.ws) {
            return;
        }

        // Skip frame if WebSocket is busy (reduce congestion)
        if (this.ws.bufferedAmount > 1024 * 50) { // Reduced to 50KB threshold
            this.frameDropCount++;
            log.debug(`Frame dropped due to WebSocket congestion (${this.frameDropCount} total)`);
            return;
        }

        // Skip frame if previous frame is still being processed (growing latency protection)
        const now = Date.now();
        const timeSinceLastFrame = now - this.lastFrameTime;
        const expectedInterval = 1000 / this.frameRate;
        
        if (timeSinceLastFrame < expectedInterval * 0.8) {
            // Still processing previous frame, skip this one
            this.frameDropCount++;
            return;
        }

        try {
            // Check if video is ready
            if (this.videoElement.readyState < 2) {
                return;
            }

            const videoWidth = this.videoElement.videoWidth;
            const videoHeight = this.videoElement.videoHeight;
            
            if (videoWidth === 0 || videoHeight === 0) {
                return;
            }

            this.lastFrameTime = now;

            // Use dynamic resolution scaling
            const targetWidth = Math.floor(videoWidth * this.scaleFactor);
            const targetHeight = Math.floor(videoHeight * this.scaleFactor);

            // Set canvas dimensions
            this.canvas.width = targetWidth;
            this.canvas.height = targetHeight;
            
            // Use bilinear filtering for better scaling performance
            this.context.imageSmoothingEnabled = true;
            this.context.imageSmoothingQuality = 'low'; // Fastest scaling
            
            // Draw and scale the video frame
            this.context.drawImage(this.videoElement, 0, 0, targetWidth, targetHeight);
            
            // Use dynamic JPEG quality
            const imageData = this.canvas.toDataURL('image/jpeg', this.quality);
            const base64Data = imageData.split(',')[1];
            
            // Prepare message with timestamp for latency measurement
            const message = {
                type: 'image_frame',
                data: {
                    imageData: base64Data,
                    width: targetWidth,
                    height: targetHeight,
                    encoding: 'jpeg',
                    timestamp: now,
                    captureTime: now // For latency tracking
                }
            };
            
            // Send to ROS2 publisher service
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify(message));
                log.debug(`Sent frame: ${targetWidth}x${targetHeight}, quality: ${Math.round(this.quality * 100)}%, buffer: ${this.ws.bufferedAmount}B`);
            }
            
        } catch (error) {
            log.error('Error capturing video frame:', error);
        }
    }

    setFrameRate(frameRate) {
        this.frameRate = frameRate;
        
        if (this.isStreaming) {
            // Restart streaming with new frame rate
            this.stopStreaming();
            setTimeout(() => {
                this.startStreaming(frameRate);
            }, 100);
        }
    }

    disconnect() {
        this.stopStreaming();
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        // Clean up canvas
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }

    getConnectionStatus() {
        if (!this.ws) return 'disconnected';
        
        switch (this.ws.readyState) {
            case WebSocket.CONNECTING:
                return 'connecting';
            case WebSocket.OPEN:
                return 'connected';
            case WebSocket.CLOSING:
                return 'closing';
            case WebSocket.CLOSED:
                return 'closed';
            default:
                return 'unknown';
        }
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    getStats() {
        return {
            frameRate: this.frameRate,
            isStreaming: this.isStreaming,
            frameDropCount: this.frameDropCount,
            connectionStatus: this.getConnectionStatus(),
            bufferAmount: this.ws ? this.ws.bufferedAmount : 0,
            lastFrameTime: this.lastFrameTime,
            timeSinceLastFrame: Date.now() - this.lastFrameTime
        };
    }

    resetStats() {
        this.frameDropCount = 0;
        this.lastFrameTime = 0;
    }

    // Add method to dynamically adjust performance
    adjustPerformance(level = 'balanced') {
        const settings = {
            'high_quality': { frameRate: 12, scaleFactor: 0.8, quality: 0.7 },
            'balanced': { frameRate: 8, scaleFactor: 0.5, quality: 0.5 },
            'low_latency': { frameRate: 5, scaleFactor: 0.3, quality: 0.3 }
        };
        
        const setting = settings[level] || settings['balanced'];
        
        this.frameRate = setting.frameRate;
        this.scaleFactor = setting.scaleFactor;
        this.quality = setting.quality;
        
        console.log(`Performance adjusted to ${level}:`, setting);
        
        if (this.isStreaming) {
            this.stopStreaming();
            setTimeout(() => {
                this.startStreaming(this.frameRate);
            }, 100);
        }
    }
}
