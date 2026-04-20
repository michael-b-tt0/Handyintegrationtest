window.webxrInterop = (() => {
    const instances = new Map();

    function getInstance(canvasId) {
        const instance = instances.get(canvasId);
        if (!instance) {
            throw new Error(`WebXR canvas '${canvasId}' has not been initialized.`);
        }

        return instance;
    }

    async function notify(instance) {
        if (!instance.component) {
            return;
        }

        await instance.component.invokeMethodAsync(
            "UpdateState",
            !!instance.isSupported,
            !!window.isSecureContext,
            !!instance.session,
            instance.status
        );
    }

    function resizeCanvas(instance) {
        if (!instance.canvas) {
            return;
        }

        const pixelRatio = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.floor(instance.canvas.clientWidth * pixelRatio));
        const height = Math.max(1, Math.floor(instance.canvas.clientHeight * pixelRatio));

        if (instance.canvas.width !== width || instance.canvas.height !== height) {
            instance.canvas.width = width;
            instance.canvas.height = height;
        }
    }

    function renderFrame(time, frame, instance) {
        if (!instance.session || !instance.referenceSpace || !instance.gl) {
            return;
        }

        instance.frameHandle = instance.session.requestAnimationFrame((nextTime, nextFrame) =>
            renderFrame(nextTime, nextFrame, instance));

        const pose = frame.getViewerPose(instance.referenceSpace);
        const baseLayer = instance.session.renderState.baseLayer;
        if (!pose || !baseLayer) {
            return;
        }

        instance.gl.bindFramebuffer(instance.gl.FRAMEBUFFER, baseLayer.framebuffer);

        for (const view of pose.views) {
            const viewport = baseLayer.getViewport(view);
            instance.gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
            instance.gl.clearColor(0.06, 0.13, 0.20, 1.0);
            instance.gl.clear(instance.gl.COLOR_BUFFER_BIT | instance.gl.DEPTH_BUFFER_BIT);
        }
    }

    async function cleanupSession(instance, endedStatus) {
        if (instance.session && instance.frameHandle) {
            try {
                instance.session.cancelAnimationFrame(instance.frameHandle);
            } catch {
            }
        }

        instance.frameHandle = 0;
        instance.referenceSpace = null;
        instance.session = null;
        instance.status = endedStatus;
        await notify(instance);
    }

    return {
        async initialize(canvasId, component) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) {
                throw new Error(`Canvas '${canvasId}' was not found.`);
            }

            const instance = {
                canvas,
                component,
                gl: null,
                isSupported: false,
                session: null,
                referenceSpace: null,
                frameHandle: 0,
                status: "Checking WebXR support..."
            };

            instances.set(canvasId, instance);

            try {
                if (!window.isSecureContext) {
                    instance.status = "WebXR needs a secure context. Use HTTPS or localhost when opening this page.";
                    await notify(instance);
                    return;
                }

                if (!("xr" in navigator) || !navigator.xr) {
                    instance.status = "This browser does not expose navigator.xr.";
                    await notify(instance);
                    return;
                }

                resizeCanvas(instance);

                const gl = canvas.getContext("webgl2", {
                    alpha: false,
                    antialias: true,
                    depth: true,
                    stencil: false,
                    xrCompatible: true
                }) || canvas.getContext("webgl", {
                    alpha: false,
                    antialias: true,
                    depth: true,
                    stencil: false,
                    xrCompatible: true
                });

                if (!gl) {
                    instance.status = "This browser did not provide a compatible WebGL context for XR.";
                    await notify(instance);
                    return;
                }

                instance.gl = gl;
                instance.isSupported = await navigator.xr.isSessionSupported("immersive-vr");
                instance.status = instance.isSupported
                    ? "WebXR is available. Put on a supported headset and use Enter VR."
                    : "This browser or device does not report immersive VR support.";

                await notify(instance);
            } catch (error) {
                instance.status = `WebXR setup failed: ${error?.message ?? error}`;
                await notify(instance);
            }
        },

        async enterVr(canvasId) {
            const instance = getInstance(canvasId);

            if (!instance.gl) {
                throw new Error("The WebGL context is not ready yet.");
            }

            if (!instance.isSupported) {
                throw new Error("Immersive VR is not supported on this browser or device.");
            }

            if (instance.session) {
                instance.status = "VR session is already active.";
                await notify(instance);
                return;
            }

            try {
                resizeCanvas(instance);

                if (instance.gl.makeXRCompatible) {
                    await instance.gl.makeXRCompatible();
                }

                const session = await navigator.xr.requestSession("immersive-vr", {
                    optionalFeatures: ["local-floor", "bounded-floor"]
                });

                instance.session = session;

                session.addEventListener("end", async () => {
                    await cleanupSession(instance, "VR session ended.");
                }, { once: true });

                const baseLayer = new XRWebGLLayer(session, instance.gl, {
                    alpha: false,
                    antialias: true,
                    depth: true,
                    stencil: false,
                    ignoreDepthValues: false
                });

                session.updateRenderState({ baseLayer });

                try {
                    instance.referenceSpace = await session.requestReferenceSpace("local-floor");
                } catch {
                    instance.referenceSpace = await session.requestReferenceSpace("local");
                }

                instance.status = "VR session started.";
                await notify(instance);

                instance.frameHandle = session.requestAnimationFrame((time, frame) =>
                    renderFrame(time, frame, instance));
            } catch (error) {
                instance.status = `Could not start VR: ${error?.message ?? error}`;
                await notify(instance);
                throw error;
            }
        },

        async exitVr(canvasId) {
            const instance = getInstance(canvasId);
            if (!instance.session) {
                return;
            }

            const session = instance.session;
            await session.end();
        },

        async dispose(canvasId) {
            const instance = instances.get(canvasId);
            if (!instance) {
                return;
            }

            try {
                if (instance.session) {
                    const session = instance.session;
                    instance.session = null;
                    await session.end();
                }
            } catch {
            }

            instances.delete(canvasId);
        }
    };
})();
