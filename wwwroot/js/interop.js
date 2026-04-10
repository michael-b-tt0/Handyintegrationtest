window.downloadFile = (href, fileName) => {
    const link = document.createElement('a');
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.getBoundingClientRect = (element) => {
    const rect = element.getBoundingClientRect();
    return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
    };
};

window.applyTheme = (theme) => {
    document.documentElement.setAttribute('data-bs-theme', theme);
};

window.localStorage = {
    getItem: (key) => {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    },
    setItem: (key, value) => {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            // localStorage might not be available
        }
    }
};

window.setupDropZone = (element, componentRef) => {
    element.addEventListener('drop', async (e) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            // Set loading state immediately
            await componentRef.invokeMethodAsync('OnDropStart');
            const reader = new FileReader();
            reader.onload = async () => {
                const arrayBuffer = reader.result;
                // Convert to base64 for efficient transfer (chunked to avoid stack overflow)
                const uint8Array = new Uint8Array(arrayBuffer);
                let binaryString = '';
                const chunkSize = 8192; // Process in chunks to avoid stack overflow
                for (let i = 0; i < uint8Array.length; i += chunkSize) {
                    const chunk = uint8Array.slice(i, i + chunkSize);
                    binaryString += String.fromCharCode.apply(null, chunk);
                }
                const base64 = btoa(binaryString);
                await componentRef.invokeMethodAsync('ProcessDroppedFile', file.name, base64);
            };
            reader.readAsArrayBuffer(file);
        }
    });
    element.addEventListener('dragover', (e) => e.preventDefault());
    element.addEventListener('dragenter', () => componentRef.invokeMethodAsync('OnDragEnter'));
    element.addEventListener('dragleave', () => componentRef.invokeMethodAsync('OnDragLeave'));
};

window.setupMetadataDropZone = (element, componentRef) => {
    element.addEventListener('drop', async (e) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            await componentRef.invokeMethodAsync(
                'ProcessDroppedFileMetadata',
                file.name,
                file.size,
                file.type || ''
            );
        }
    });
    element.addEventListener('dragover', (e) => e.preventDefault());
    element.addEventListener('dragenter', () => componentRef.invokeMethodAsync('OnDragEnter'));
    element.addEventListener('dragleave', () => componentRef.invokeMethodAsync('OnDragLeave'));
};
window.setupVideoInputDropZone = (element, componentRef) => {
    const notifySelection = async (file, isDroppedFile) => {
        if (!file) {
            return;
        }

        const objectUrl = URL.createObjectURL(file);
        await componentRef.invokeMethodAsync(
            'ProcessSelectedVideo',
            file.name,
            file.size,
            file.type || '',
            objectUrl,
            isDroppedFile
        );
    };

    element.addEventListener('drop', async (e) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            await notifySelection(files[0], true);
        }
    });

    element.addEventListener('dragover', (e) => e.preventDefault());
    element.addEventListener('dragenter', () => componentRef.invokeMethodAsync('OnDragEnter'));
    element.addEventListener('dragleave', () => componentRef.invokeMethodAsync('OnDragLeave'));

    const input = element.querySelector('input[type="file"]');
    if (input) {
        input.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files.length > 0 ? e.target.files[0] : null;
            await notifySelection(file, false);
        });
    }
};

window.revokeObjectUrl = (url) => {
    if (url) {
        URL.revokeObjectURL(url);
    }
};

window.videoCanvasSync = {
    setup: (videoElement, componentRef) => {
        if (!videoElement) {
            return;
        }

        if (videoElement._videoCanvasSyncHandlers) {
            window.videoCanvasSync.dispose(videoElement);
        }

        const notify = () => {
            const currentTimeMs = Math.round((videoElement.currentTime || 0) * 1000);
            const durationMs = Number.isFinite(videoElement.duration)
                ? Math.round(videoElement.duration * 1000)
                : 0;

            componentRef.invokeMethodAsync('OnVideoTimeChanged', currentTimeMs, durationMs);
        };

        const handlers = {
            loadedmetadata: notify,
            timeupdate: notify,
            seeked: notify,
            seeking: notify
        };

        Object.entries(handlers).forEach(([eventName, handler]) => {
            videoElement.addEventListener(eventName, handler);
        });

        videoElement._videoCanvasSyncHandlers = handlers;
        notify();
    },

    dispose: (videoElement) => {
        if (!videoElement || !videoElement._videoCanvasSyncHandlers) {
            return;
        }

        Object.entries(videoElement._videoCanvasSyncHandlers).forEach(([eventName, handler]) => {
            videoElement.removeEventListener(eventName, handler);
        });

        delete videoElement._videoCanvasSyncHandlers;
    },

    seek: (videoElement, timeMs) => {
        if (!videoElement) {
            return;
        }

        const durationMs = Number.isFinite(videoElement.duration)
            ? Math.round(videoElement.duration * 1000)
            : null;
        const clampedMs = durationMs === null
            ? Math.max(0, timeMs || 0)
            : Math.max(0, Math.min(timeMs || 0, durationMs));

        videoElement.currentTime = clampedMs / 1000;
    }
};
window.videoFullscreenSync = {
    _instances: new Map(),

    setup: function (element, componentRef) {
        if (!element) {
            return;
        }

        if (element._videoFullscreenSyncId) {
            this.dispose(element);
        }

        const notify = () => {
            const isFullscreen = document.fullscreenElement === element;
            componentRef.invokeMethodAsync('OnFullscreenChanged', isFullscreen);
        };

        document.addEventListener('fullscreenchange', notify);

        const instanceId = `video_fullscreen_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        element._videoFullscreenSyncId = instanceId;
        this._instances.set(instanceId, {
            element,
            notify
        });

        notify();
    },

    toggle: async function (element) {
        if (!element) {
            return;
        }

        if (document.fullscreenElement === element) {
            await document.exitFullscreen();
            return;
        }

        if (document.fullscreenElement) {
            await document.exitFullscreen();
        }

        await element.requestFullscreen();
    },

    dispose: function (element) {
        const instanceId = element?._videoFullscreenSyncId;
        if (!instanceId) {
            return;
        }

        const instance = this._instances.get(instanceId);
        if (instance) {
            document.removeEventListener('fullscreenchange', instance.notify);
            this._instances.delete(instanceId);
        }

        delete element._videoFullscreenSyncId;
    }
};

window.videoTimelineOverlay = {
    _instances: new Map(),
    _timeWindowMs: 10000,

    _drawTimeline: function (ctx, width, height, actions, lastActionAt, centerTimeMs, mediaDurationMs) {
        if (!ctx || !actions || actions.length < 2 || width <= 0 || height <= 0) {
            return;
        }

        const scriptEndMs = Math.max(0, lastActionAt || 0);
        const playbackEndMs = Math.max(scriptEndMs, mediaDurationMs || 0);
        if (playbackEndMs <= 0) {
            return;
        }

        const clampedCenter = Math.max(0, Math.min(centerTimeMs || 0, playbackEndMs));
        const halfSpan = this._timeWindowMs / 2;
        let timeStart = Math.max(0, clampedCenter - halfSpan);
        let timeEnd = Math.min(playbackEndMs, clampedCenter + halfSpan);

        if (timeEnd <= timeStart) {
            timeStart = Math.max(0, playbackEndMs - this._timeWindowMs);
            timeEnd = playbackEndMs;
        }

        if (timeEnd <= timeStart) {
            return;
        }

        ctx.clearRect(0, 0, width, height);

        const timeToX = (t) => ((t - timeStart) / (timeEnd - timeStart)) * width;
        const posToY = (p) => (1 - (p / 100)) * height;
        const visibleActionStart = Math.max(0, timeStart);
        const visibleActionEnd = Math.min(scriptEndMs, timeEnd);

        if (visibleActionEnd > visibleActionStart) {
            let startIdx = 0;
            let endIdx = actions.length - 1;

            for (let i = 0; i < actions.length; i++) {
                if (actions[i].at >= visibleActionStart) {
                    startIdx = Math.max(0, i - 1);
                    break;
                }
            }

            for (let i = actions.length - 1; i >= 0; i--) {
                if (actions[i].at <= visibleActionEnd) {
                    endIdx = Math.min(actions.length - 1, i + 1);
                    break;
                }
            }

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            for (let i = Math.max(1, startIdx); i <= endIdx; i++) {
                const prev = actions[i - 1];
                const curr = actions[i];
                const speed = window.canvasMagnifier._getSpeed(prev, curr);
                const color = window.canvasMagnifier._getColor(Math.round(speed));
                const x1 = timeToX(prev.at);
                const y1 = posToY(prev.pos);
                const x2 = timeToX(curr.at);
                const y2 = posToY(curr.pos);

                ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.28)`;
                ctx.lineWidth = 5.5;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();

                ctx.strokeStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
                ctx.lineWidth = 2.75;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.lineWidth = 5.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(width / 2, 0);
        ctx.lineTo(width / 2, height);
        ctx.stroke();
    },

    setup: function (videoElement, actionsJson, lastActionAt) {
        if (!videoElement) {
            return;
        }

        if (videoElement._videoTimelineOverlayId) {
            this.dispose(videoElement);
        }

        let actions = [];
        try {
            actions = JSON.parse(actionsJson);
        } catch (e) {
            return;
        }

        if (!actions || actions.length < 2) {
            return;
        }

        const frame = videoElement.parentElement;
        if (!frame) {
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'video-timeline-overlay';
        overlay.style.position = 'absolute';
        overlay.style.left = '50%';
        overlay.style.top = '50%';
        overlay.style.transform = 'translate(-50%, -50%)';
        overlay.style.zIndex = '3';
        overlay.style.display = 'none';
        overlay.style.width = '46%';
        overlay.style.maxWidth = 'calc(100% - 28px)';
        overlay.style.padding = '0';
        overlay.style.border = 'none';
        overlay.style.borderRadius = '0';
        overlay.style.background = 'transparent';
        overlay.style.backdropFilter = 'none';
        overlay.style.boxShadow = 'none';
        overlay.style.pointerEvents = 'none';

        const label = document.createElement('div');
        label.className = 'video-timeline-overlay__label';
        label.textContent = '10s magnified timeline';
        label.style.display = 'none';

        const canvas = document.createElement('canvas');
        canvas.width = 1000;
        canvas.height = 320;
        canvas.className = 'video-timeline-overlay__canvas';
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.aspectRatio = '25 / 8';
        canvas.style.borderRadius = '0';
        canvas.style.background = 'transparent';

        overlay.appendChild(label);
        overlay.appendChild(canvas);
        frame.appendChild(overlay);

        const instanceId = `video_overlay_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        videoElement._videoTimelineOverlayId = instanceId;

        this._instances.set(instanceId, {
            videoElement,
            overlay,
            canvas,
            actions,
            lastActionAt,
            enabled: false
        });
    },

    setEnabled: function (videoElement, enabled) {
        const instance = this._instances.get(videoElement?._videoTimelineOverlayId);
        if (!instance) {
            return;
        }

        instance.enabled = !!enabled;
        instance.overlay.style.display = instance.enabled ? 'block' : 'none';
    },

    render: function (videoElement, currentTimeMs) {
        const instance = this._instances.get(videoElement?._videoTimelineOverlayId);
        if (!instance || !instance.enabled) {
            return;
        }

        const ctx = instance.canvas.getContext('2d');
        const mediaDurationMs = Number.isFinite(videoElement?.duration)
            ? Math.round(videoElement.duration * 1000)
            : instance.lastActionAt;

        this._drawTimeline(
            ctx,
            instance.canvas.width,
            instance.canvas.height,
            instance.actions,
            instance.lastActionAt,
            currentTimeMs,
            mediaDurationMs
        );
    },

    dispose: function (videoElement) {
        const instanceId = videoElement?._videoTimelineOverlayId;
        if (!instanceId) {
            return;
        }

        const instance = this._instances.get(instanceId);
        if (instance) {
            instance.overlay.remove();
            this._instances.delete(instanceId);
        }

        delete videoElement._videoTimelineOverlayId;
    }
};

window.screenHelper = {
    getScreenWidth: function () {
        return window.screen.width;  // Actual screen resolution
    },
};

window.canvasMagnifier = {
    _instances: new Map(),
    _autoShow: false,

    _heatmapColors: [
        { r: 0, g: 0, b: 0 },
        { r: 30, g: 144, b: 255 },
        { r: 34, g: 139, b: 34 },
        { r: 255, g: 215, b: 0 },
        { r: 220, g: 20, b: 60 },
        { r: 147, g: 112, b: 219 },
        { r: 37, g: 22, b: 122 }
    ],

    _getColor: function (intensity) {
        const colors = this._heatmapColors;
        const stepSize = 120;
        if (intensity <= 0) return colors[0];
        if (intensity > 5 * stepSize) return colors[colors.length - 1];
        intensity += stepSize / 2;
        const index = Math.min(colors.length - 2, Math.floor(intensity / stepSize));
        const t = Math.min(1, Math.max(0, (intensity % stepSize) / stepSize));
        const a = colors[index], b = colors[index + 1];
        const r = Math.round(a.r + (b.r - a.r) * t);
        const g = Math.round(a.g + (b.g - a.g) * t);
        const bl = Math.round(a.b + (b.b - a.b) * t);
        return { r, g, b: bl };
    },

    _getSpeed: function (a1, a2) {
        if (a1.at === a2.at) return 0;
        return 1000 * Math.abs(a2.pos - a1.pos) / Math.abs(a2.at - a1.at);
    },

    _createBoundaryOverlay: function (container) {
        if (!container) return null;

        const computedStyle = window.getComputedStyle(container);
        if (computedStyle.position === 'static') {
            container.style.position = 'relative';
        }

        const overlay = document.createElement('div');
        overlay.style.position = 'absolute';
        overlay.style.pointerEvents = 'none';
        overlay.style.display = 'none';
        overlay.style.zIndex = '2';
        overlay.style.overflow = 'hidden';

        const leftShade = document.createElement('div');
        leftShade.style.position = 'absolute';
        leftShade.style.top = '0';
        leftShade.style.bottom = '0';
        leftShade.style.left = '0';
        leftShade.style.background = 'rgba(0, 0, 0, 0.4)';

        const rightShade = document.createElement('div');
        rightShade.style.position = 'absolute';
        rightShade.style.top = '0';
        rightShade.style.bottom = '0';
        rightShade.style.right = '0';
        rightShade.style.background = 'rgba(0, 0, 0, 0.4)';

        const leftLine = document.createElement('div');
        leftLine.style.position = 'absolute';
        leftLine.style.top = '0';
        leftLine.style.bottom = '0';
        leftLine.style.width = '2px';
        leftLine.style.background = 'rgba(255, 255, 255, 0.8)';

        const rightLine = document.createElement('div');
        rightLine.style.position = 'absolute';
        rightLine.style.top = '0';
        rightLine.style.bottom = '0';
        rightLine.style.width = '2px';
        rightLine.style.background = 'rgba(255, 255, 255, 0.8)';

        overlay.appendChild(leftShade);
        overlay.appendChild(rightShade);
        overlay.appendChild(leftLine);
        overlay.appendChild(rightLine);
        container.appendChild(overlay);

        return { root: overlay, leftShade, rightShade, leftLine, rightLine };
    },

    _updateBoundaryOverlay: function (overlay, sourceCanvas, timeStart, timeEnd, lastActionAt) {
        if (!overlay || !sourceCanvas || !lastActionAt) return;

        const canvasWidth = sourceCanvas.offsetWidth || sourceCanvas.width || 0;
        const canvasHeight = sourceCanvas.offsetHeight || sourceCanvas.height || 0;
        const canvasLeft = sourceCanvas.offsetLeft || 0;
        const canvasTop = sourceCanvas.offsetTop || 0;

        if (canvasWidth <= 0 || canvasHeight <= 0) {
            overlay.root.style.display = 'none';
            return;
        }

        const leftX = (timeStart / lastActionAt) * canvasWidth;
        const rightX = (timeEnd / lastActionAt) * canvasWidth;

        overlay.root.style.display = 'block';
        overlay.root.style.left = `${canvasLeft}px`;
        overlay.root.style.top = `${canvasTop}px`;
        overlay.root.style.width = `${canvasWidth}px`;
        overlay.root.style.height = `${canvasHeight}px`;

        overlay.leftShade.style.width = `${Math.max(0, leftX)}px`;
        overlay.rightShade.style.width = `${Math.max(0, canvasWidth - rightX)}px`;
        overlay.leftLine.style.left = `${Math.max(0, leftX)}px`;
        overlay.rightLine.style.left = `${Math.max(0, rightX)}px`;
    },

    _hideBoundaryOverlay: function (overlay) {
        if (overlay) {
            overlay.root.style.display = 'none';
        }
    },

    setup: function (sourceCanvasContainer, magnifierPopup, magnifierCanvas, zoomFactor, actionsJson, lastActionAt) {
        if (!magnifierCanvas) return;

        const magCtx = magnifierCanvas.getContext('2d');
        const magWidth = magnifierCanvas.width;
        const magHeight = magnifierCanvas.height;
        const self = this;
        const infoElement = magnifierPopup ? magnifierPopup.querySelector('.magnifier-info') : null;

        let actions = [];
        try { actions = JSON.parse(actionsJson); } catch (e) { return; }
        if (!actions || actions.length < 2) return;

        const sourceCanvas = sourceCanvasContainer.querySelector('canvas');
        const boundaryOverlay = this._createBoundaryOverlay(sourceCanvasContainer);

        let mKeyDown = false;
        let mouseOver = false;
        let lastMouseX = 0;
        let lastMouseY = 0;

        function setInfoText(text) {
            if (!infoElement) return;
            if (text && text.trim().length > 0) {
                infoElement.textContent = text;
                infoElement.style.display = 'block';
            } else {
                infoElement.textContent = '';
                infoElement.style.display = 'none';
            }
        }

        function updateMagnifier() {
            if ((mKeyDown || self._autoShow) && mouseOver && sourceCanvas) {
                document.querySelectorAll('.time-tooltip').forEach(t => {
                    t.style.display = 'none';
                });

                magnifierPopup.style.display = 'block';

                const margin = 8;
                const popupWidth = magnifierPopup.offsetWidth || magWidth;
                const popupHeight = magnifierPopup.offsetHeight || (magHeight + 30);

                let targetLeft = lastMouseX + 20;
                let targetTop = lastMouseY - popupHeight - 10;

                if (targetTop < margin) {
                    targetTop = lastMouseY + 16;
                }

                const maxLeft = window.innerWidth - popupWidth - margin;
                const maxTop = window.innerHeight - popupHeight - margin;
                targetLeft = Math.max(margin, Math.min(targetLeft, maxLeft));
                targetTop = Math.max(margin, Math.min(targetTop, maxTop));

                magnifierPopup.style.left = targetLeft + 'px';
                magnifierPopup.style.top = targetTop + 'px';

                const rect = sourceCanvas.getBoundingClientRect();
                const relX = (lastMouseX - rect.left) / rect.width;

                const timeWindowMs = 10000;
                const centerTime = relX * lastActionAt;
                const halfSpan = timeWindowMs / 2;
                const timeStart = Math.max(0, centerTime - halfSpan);
                const timeEnd = Math.min(lastActionAt, centerTime + halfSpan);

                const posStart = 0;
                const posEnd = 100;

                magCtx.fillStyle = '#1a1a1a';
                magCtx.fillRect(0, 0, magWidth, magHeight);

                function timeToX(t) {
                    return ((t - timeStart) / (timeEnd - timeStart)) * magWidth;
                }
                function posToY(p) {
                    return (1 - (p - posStart) / (posEnd - posStart)) * magHeight;
                }

                let startIdx = 0;
                let endIdx = actions.length - 1;
                for (let i = 0; i < actions.length; i++) {
                    if (actions[i].at >= timeStart) { startIdx = Math.max(0, i - 1); break; }
                }
                for (let i = actions.length - 1; i >= 0; i--) {
                    if (actions[i].at <= timeEnd) { endIdx = Math.min(actions.length - 1, i + 1); break; }
                }

                magCtx.lineCap = 'round';
                magCtx.lineJoin = 'round';
                for (let i = Math.max(1, startIdx); i <= endIdx; i++) {
                    const prev = actions[i - 1];
                    const curr = actions[i];
                    const speed = self._getSpeed(prev, curr);
                    const color = self._getColor(Math.round(speed));
                    const x1 = timeToX(prev.at), y1 = posToY(prev.pos);
                    const x2 = timeToX(curr.at), y2 = posToY(curr.pos);

                    magCtx.strokeStyle = `rgba(${color.r},${color.g},${color.b},0.3)`;
                    magCtx.lineWidth = 8;
                    magCtx.beginPath();
                    magCtx.moveTo(x1, y1);
                    magCtx.lineTo(x2, y2);
                    magCtx.stroke();

                    magCtx.strokeStyle = `rgb(${color.r},${color.g},${color.b})`;
                    magCtx.lineWidth = 3;
                    magCtx.beginPath();
                    magCtx.moveTo(x1, y1);
                    magCtx.lineTo(x2, y2);
                    magCtx.stroke();
                }

                magCtx.strokeStyle = 'rgba(255,255,255,0.3)';
                magCtx.lineWidth = 1;
                magCtx.setLineDash([4, 4]);
                magCtx.beginPath();
                magCtx.moveTo(magWidth / 2, 0);
                magCtx.lineTo(magWidth / 2, magHeight);
                magCtx.moveTo(0, magHeight / 2);
                magCtx.lineTo(magWidth, magHeight / 2);
                magCtx.stroke();
                magCtx.setLineDash([]);

                self._updateBoundaryOverlay(boundaryOverlay, sourceCanvas, timeStart, timeEnd, lastActionAt);
            } else {
                magnifierPopup.style.display = 'none';
                setInfoText('');
                self._hideBoundaryOverlay(boundaryOverlay);
            }
        }

        function onMouseMove(e) {
            mouseOver = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            updateMagnifier();
        }

        function onMouseLeave() {
            mouseOver = false;
            updateMagnifier();
        }

        function onKeyDown(e) {
            if (e.key === 'm' || e.key === 'M') {
                if (!mKeyDown) {
                    mKeyDown = true;
                    updateMagnifier();
                }
            }
        }

        function onKeyUp(e) {
            if (e.key === 'm' || e.key === 'M') {
                mKeyDown = false;
                updateMagnifier();
            }
        }

        sourceCanvasContainer.addEventListener('mousemove', onMouseMove);
        sourceCanvasContainer.addEventListener('mouseleave', onMouseLeave);
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);

        const instanceId = sourceCanvasContainer.id || ('mag_' + Date.now());
        sourceCanvasContainer._magnifierId = instanceId;
        this._instances.set(instanceId, {
            container: sourceCanvasContainer,
            popup: magnifierPopup,
            setInfoText,
            boundaryOverlay,
            isVisible: () => (mKeyDown || self._autoShow) && mouseOver,
            onMouseMove,
            onMouseLeave,
            onKeyDown,
            onKeyUp
        });
    },

    isOpen: function (sourceCanvasContainer) {
        const instanceId = sourceCanvasContainer ? sourceCanvasContainer._magnifierId : null;
        if (!instanceId) return false;
        const instance = this._instances.get(instanceId);
        if (!instance || !instance.isVisible) return false;
        return instance.isVisible();
    },

    setClickInfo: function (sourceCanvasContainer, text) {
        const instanceId = sourceCanvasContainer ? sourceCanvasContainer._magnifierId : null;
        if (!instanceId) return;
        const instance = this._instances.get(instanceId);
        if (!instance || !instance.setInfoText) return;
        instance.setInfoText(text);
    },

    dispose: function (sourceCanvasContainer) {
        const instanceId = sourceCanvasContainer._magnifierId;
        if (!instanceId) return;

        const instance = this._instances.get(instanceId);
        if (instance) {
            instance.container.removeEventListener('mousemove', instance.onMouseMove);
            instance.container.removeEventListener('mouseleave', instance.onMouseLeave);
            document.removeEventListener('keydown', instance.onKeyDown);
            document.removeEventListener('keyup', instance.onKeyUp);
            if (instance.boundaryOverlay && instance.boundaryOverlay.root) {
                instance.boundaryOverlay.root.remove();
            }
            this._instances.delete(instanceId);
        }
    },

    setAutoShow: function (enabled) {
        this._autoShow = enabled;
    }
};










