const LivekitClient = window.LivekitClient;

const joinButton = document.getElementById("join-button");
const roomNameInput = document.getElementById("room-name");
const participantNameInput = document.getElementById("participant-name");
const videoContainer = document.getElementById("video-container");
const statusElement = document.getElementById("connection-status");

// Variable to store room instance
let activeRoom = null;

// Store the reference to the join button click handler
const joinFormClickHandler = async () => {
  // If already connected, handle disconnect
  if (activeRoom) {
    handleDisconnect();
    return;
  }

  // Show loading state
  joinButton.disabled = true;
  joinButton.textContent = "Connecting...";
  statusElement.textContent = "Requesting access token...";
  statusElement.style.backgroundColor = "#f39c12";
  statusElement.style.display = "block";

  const roomName = roomNameInput.value || "1234"; // Default to 1234 if empty
  const participantName =
    participantNameInput.value || "user-" + Math.floor(Math.random() * 1000); // Default name if empty

  if (!roomName || !participantName) {
    alert("Please enter room name and your name");
    resetButtonState();
    return;
  }

  try {
    // Get token from server instead of using hardcoded token
    const tokenResponse = await fetch(
      `/get-token?roomName=${encodeURIComponent(
        roomName
      )}&participantName=${encodeURIComponent(participantName)}`
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      throw new Error(
        `Failed to get token: ${errorData.error || "Unknown error"}`
      );
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.success || !tokenData.token) {
      throw new Error("Invalid token response");
    }

    const token = tokenData.token;
    console.log("Received token from server");
    statusElement.textContent = "Token received, connecting to room...";

    // Clear existing videos
    videoContainer.innerHTML = "";
    videoContainer.style.display = "flex";

    // Create and configure room
    const room = new LivekitClient.Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: LivekitClient.VideoPresets.h720.resolution,
      },
    });

    // Store room reference
    activeRoom = room;

    // Debug events
    room.on("disconnected", (reason) => {
      console.log("Room disconnected:", reason);
      statusElement.textContent =
        "Disconnected: " + (reason || "Unknown reason");
      statusElement.style.backgroundColor = "#e74c3c";
      resetButtonState();
      removeControlsPanel();

      // Make sure to clear video container when disconnected
      videoContainer.innerHTML = "";
      videoContainer.style.display = "none";
    });

    room.on("connectionStateChanged", (state) => {
      console.log("Connection state:", state);
      statusElement.textContent = "Connection state: " + state;

      if (state === "connected") {
        statusElement.style.backgroundColor = "#27ae60";
      } else if (state === "connecting") {
        statusElement.style.backgroundColor = "#f39c12";
      } else if (state === "disconnected") {
        statusElement.style.backgroundColor = "#e74c3c";
        resetButtonState();
        removeControlsPanel();
      }
    });

    // Handle participant disconnection
    room.on("participantDisconnected", (participant) => {
      console.log("Participant disconnected:", participant.identity);

      // Remove all video elements associated with this participant
      removeParticipantElements(participant.identity);
    });

    // Handle participant reconnection
    room.on("participantReconnected", (participant) => {
      console.log("Participant reconnected:", participant.identity);
      // With our improved element management, we don't need to do anything special here
      // as trackSubscribed will handle adding tracks back if needed
    });

    // Function to remove all elements for a specific participant by identity
    function removeParticipantElements(identity) {
      // Find all video elements for this participant
      const videoElements = document.querySelectorAll(
        `video[data-participant="${identity}"], video[data-local="true"]`
      );
      videoElements.forEach((videoElement) => {
        // Stop all tracks in the media element
        if (videoElement.srcObject) {
          const tracks = videoElement.srcObject.getTracks();
          tracks.forEach((track) => {
            track.stop();
            console.log(`Stopped track for ${identity}:`, track.kind);
          });
          videoElement.srcObject = null;
        }

        // Remove the container
        const wrapper = videoElement.closest(".video-wrapper");
        if (wrapper) {
          wrapper.remove();
        } else {
          videoElement.remove();
        }
      });

      // Also check for screen share elements
      const screenShareElements = document.querySelectorAll(
        `.video-wrapper[data-screen-share="${identity}"]`
      );
      screenShareElements.forEach((el) => {
        const video = el.querySelector("video");
        if (video && video.srcObject) {
          const tracks = video.srcObject.getTracks();
          tracks.forEach((track) => {
            track.stop();
            console.log(
              `Stopped screen share track for ${identity}:`,
              track.kind
            );
          });
          video.srcObject = null;
        }
        console.log(`Removing screen share container for ${identity}`);
        el.remove();
      });

      // Handle audio elements
      const audioElements = document.querySelectorAll(
        `audio[data-participant="${identity}"]`
      );
      audioElements.forEach((audioElement) => {
        if (audioElement.srcObject) {
          const tracks = audioElement.srcObject.getTracks();
          tracks.forEach((track) => {
            track.stop();
            console.log(`Stopped audio track for ${identity}`);
          });
          audioElement.srcObject = null;
        }
        audioElement.remove();
      });
    }

    // Handle remote participants' tracks
    room.on("trackSubscribed", (track, publication, participant) => {
      console.log(
        "Track subscribed:",
        track.kind,
        "Source:",
        track.source,
        "from",
        participant.identity
      );

      if (track.kind === "video") {
        // First, check if there's already a container for this participant and track source
        const isScreenShare =
          track.source === "screen" || track.source === "screenshare";
        const selector = isScreenShare
          ? `.video-wrapper[data-screen-share="${participant.identity}"]`
          : `.video-wrapper:has(video[data-participant="${participant.identity}"])`;

        const existingContainer = document.querySelector(selector);

        if (existingContainer) {
          console.log(
            `Container for ${participant.identity}'s ${
              isScreenShare ? "screen" : "camera"
            } already exists, reusing`
          );
          // If container exists, but might have lost the video element, create a new one
          const existingVideo = existingContainer.querySelector("video");
          if (!existingVideo) {
            const videoElement = track.attach();
            videoElement.setAttribute("autoplay", "");
            videoElement.setAttribute("playsinline", "");
            videoElement.setAttribute("data-participant", participant.identity);
            existingContainer.appendChild(videoElement);

            // Force playback
            setTimeout(() => {
              videoElement
                .play()
                .catch((e) =>
                  console.error("Play failed for remote video:", e)
                );
            }, 100);
          }
          return;
        }

        // If no container exists, create a new one
        const videoElement = track.attach();
        videoElement.setAttribute("autoplay", "");
        videoElement.setAttribute("playsinline", "");

        // Create wrapper with appropriate class and data attribute
        const videoWrapper = document.createElement("div");
        videoWrapper.className = "video-wrapper";

        if (isScreenShare) {
          videoWrapper.setAttribute("data-screen-share", participant.identity);
          // Add screen share label
          const nameLabel = document.createElement("div");
          nameLabel.className = "participant-name";
          nameLabel.textContent = `${participant.identity}'s Screen`;
          videoWrapper.appendChild(nameLabel);
        } else {
          videoElement.classList.add("remote-video");
          videoElement.setAttribute("data-participant", participant.identity);
          // Add participant name label
          const nameLabel = document.createElement("div");
          nameLabel.className = "participant-name";
          nameLabel.textContent = participant.identity;
          videoWrapper.appendChild(nameLabel);
        }

        videoWrapper.appendChild(videoElement);

        // Force playback
        setTimeout(() => {
          videoElement
            .play()
            .catch((e) => console.error("Play failed for remote video:", e));
        }, 100);

        videoContainer.appendChild(videoWrapper);
      }

      if (track.kind === "audio") {
        // Check for existing audio element for this participant
        const existingAudio = document.querySelector(
          `audio[data-participant="${participant.identity}"]`
        );
        if (existingAudio) {
          existingAudio.remove(); // Remove it to avoid duplicates
        }

        const audioElement = track.attach();
        audioElement.setAttribute("data-participant", participant.identity);
        audioElement.controls = false;
        document.body.appendChild(audioElement);
      }
    });

    // Improved trackUnsubscribed handler
    room.on("trackUnsubscribed", (track, publication, participant) => {
      console.log(
        "Track unsubscribed:",
        track.kind,
        "from",
        participant.identity
      );

      // First detach the track elements
      const elements = track.detach();

      elements.forEach((element) => {
        // Make sure to stop the tracks
        if (element.srcObject) {
          const tracks = element.srcObject.getTracks();
          tracks.forEach((track) => {
            track.stop();
            console.log(
              `Stopped unsubscribed track for ${participant.identity}:`,
              track.kind
            );
          });
          element.srcObject = null;
        }

        // Find the parent wrapper
        let wrapper = element.closest(".video-wrapper");

        // Remove the wrapper if found (which contains the video element)
        if (wrapper) {
          console.log(
            `Removing video wrapper for ${participant.identity}'s ${track.kind} track`
          );
          wrapper.remove();
        } else {
          // If no wrapper found (like for audio elements), remove the element itself
          console.log(
            `Removing standalone ${track.kind} element for ${participant.identity}`
          );
          element.remove();
        }
      });

      // If this was a screen share track, make sure to clean up any indicator
      if (track.source === "screen" || track.source === "screenshare") {
        const screenShareElements = document.querySelectorAll(
          `.video-wrapper[data-screen-share="${participant.identity}"]`
        );
        screenShareElements.forEach((el) => {
          const video = el.querySelector("video");
          if (video && video.srcObject) {
            const tracks = video.srcObject.getTracks();
            tracks.forEach((track) => track.stop());
            video.srcObject = null;
          }
          console.log(
            `Removing screen share container for ${participant.identity}`
          );
          el.remove();
        });
      }
    });

    // Handle local participant's tracks
    room.on("localTrackPublished", (publication) => {
      console.log(
        "Local track published:",
        publication.track.kind,
        "Source:",
        publication.track.source
      );

      if (publication.track.kind === "video") {
        // Check if there's already a container for this track source
        const isScreenShare =
          publication.track.source === "screen" ||
          publication.track.source === "screenshare";
        const selector = isScreenShare
          ? `.video-wrapper[data-screen-share="local"]`
          : `.video-wrapper:has(video[data-local="true"])`;

        const existingContainer = document.querySelector(selector);

        if (existingContainer) {
          console.log(
            `Local ${
              isScreenShare ? "screen share" : "camera"
            } container already exists, reusing`
          );
          return;
        }

        const videoElement = publication.track.attach();
        videoElement.setAttribute("autoplay", "");
        videoElement.setAttribute("playsinline", "");
        videoElement.muted = true;

        // Create wrapper with appropriate class and data attribute
        const videoWrapper = document.createElement("div");
        videoWrapper.className = "video-wrapper local-wrapper";

        if (isScreenShare) {
          videoWrapper.setAttribute("data-screen-share", "local");
          // Add screen share label
          const nameLabel = document.createElement("div");
          nameLabel.className = "participant-name";
          nameLabel.textContent = "Your Screen";
          videoWrapper.appendChild(nameLabel);
        } else {
          videoElement.classList.add("local-video");
          videoElement.setAttribute("data-local", "true");
          // Add self label
          const nameLabel = document.createElement("div");
          nameLabel.className = "participant-name";
          nameLabel.textContent = "You (" + participantName + ")";
          videoWrapper.appendChild(nameLabel);
        }

        videoWrapper.appendChild(videoElement);

        // Force playback
        setTimeout(() => {
          videoElement
            .play()
            .catch((e) => console.error("Play failed for local video:", e));
        }, 100);

        videoContainer.appendChild(videoWrapper);
      }
    });

    // Connect to room with the generated token
    statusElement.textContent = "Connecting to LiveKit server...";
    await room.connect(
      "wss://video-chat-application-7u5wc7ae.livekit.cloud",
      token
    );
    console.log("Connected to room:", room.name);
    statusElement.textContent = "Connected to room: " + room.name;
    statusElement.style.backgroundColor = "#27ae60";

    // Change button to disconnect
    joinButton.textContent = "Disconnect";
    joinButton.disabled = false;

    // Reset the click handler to directly use handleDisconnect
    joinButton.removeEventListener("click", joinFormClickHandler);
    joinButton.addEventListener("click", handleDisconnect);

    // Request permissions and enable camera/microphone
    statusElement.textContent = "Enabling camera and microphone...";
    await room.localParticipant.enableCameraAndMicrophone();
    console.log("Camera and microphone enabled");
    statusElement.textContent =
      "Connected to " + room.name + " as " + participantName;

    // Create control panel with toggle buttons
    createControlsPanel(room);
  } catch (error) {
    console.error("Connection failed:", error);
    statusElement.textContent = "Error: " + error.message;
    statusElement.style.backgroundColor = "#e74c3c";
    alert("Connection failed: " + error.message);
    resetButtonState();
    activeRoom = null;
  }
};

// Attach the handler to the join button
joinButton.addEventListener("click", joinFormClickHandler);

// Function to create control panel with toggle buttons
function createControlsPanel(room) {
  // Remove existing panel if any
  removeControlsPanel();

  // Create control panel container
  const controlsPanel = document.createElement("div");
  controlsPanel.id = "controls-panel";
  controlsPanel.className = "controls-panel";

  // Create microphone toggle button
  const micButton = document.createElement("button");
  micButton.className = "control-button mic-button active";
  micButton.innerHTML = '<i class="fas fa-microphone"></i>';
  micButton.title = "Toggle Microphone";
  let micEnabled = true;

  micButton.addEventListener("click", async () => {
    try {
      if (micEnabled) {
        await room.localParticipant.setMicrophoneEnabled(false);
        micButton.className = "control-button mic-button inactive";
        micButton.innerHTML = '<i class="fas fa-microphone-slash"></i>';
      } else {
        await room.localParticipant.setMicrophoneEnabled(true);
        micButton.className = "control-button mic-button active";
        micButton.innerHTML = '<i class="fas fa-microphone"></i>';
      }
      micEnabled = !micEnabled;
    } catch (e) {
      console.error("Error toggling microphone:", e);
      alert("Failed to toggle microphone: " + e.message);
    }
  });

  // Create camera toggle button
  const cameraButton = document.createElement("button");
  cameraButton.className = "control-button camera-button active";
  cameraButton.innerHTML = '<i class="fas fa-video"></i>';
  cameraButton.title = "Toggle Camera";
  let cameraEnabled = true;

  cameraButton.addEventListener("click", async () => {
    try {
      if (cameraEnabled) {
        await room.localParticipant.setCameraEnabled(false);
        cameraButton.className = "control-button camera-button inactive";
        cameraButton.innerHTML = '<i class="fas fa-video-slash"></i>';
      } else {
        await room.localParticipant.setCameraEnabled(true);
        cameraButton.className = "control-button camera-button active";
        cameraButton.innerHTML = '<i class="fas fa-video"></i>';
      }
      cameraEnabled = !cameraEnabled;
    } catch (e) {
      console.error("Error toggling camera:", e);
      alert("Failed to toggle camera: " + e.message);
    }
  });

  // Create screen share button
  const screenShareButton = document.createElement("button");
  screenShareButton.className = "control-button screen-button";
  screenShareButton.innerHTML = '<i class="fas fa-desktop"></i>';
  screenShareButton.title = "Share Screen";
  let screenShareEnabled = false;

  screenShareButton.addEventListener("click", async () => {
    try {
      if (screenShareEnabled) {
        await room.localParticipant.setScreenShareEnabled(false);
        screenShareButton.className = "control-button screen-button";
        screenShareButton.innerHTML = '<i class="fas fa-desktop"></i>';

        // Remove any screen share containers for local participant
        const screenContainers = document.querySelectorAll(
          '.video-wrapper[data-screen-share="local"]'
        );
        screenContainers.forEach((container) => container.remove());
      } else {
        await room.localParticipant.setScreenShareEnabled(true);
        screenShareButton.className = "control-button screen-button active";
        screenShareButton.innerHTML =
          '<i class="fas fa-desktop"></i> <span class="sharing-indicator">Sharing</span>';
      }
      screenShareEnabled = !screenShareEnabled;
    } catch (e) {
      console.error("Error toggling screen share:", e);
      alert("Failed to toggle screen share: " + e.message);
    }
  });

  // Add buttons to panel
  controlsPanel.appendChild(micButton);
  controlsPanel.appendChild(cameraButton);
  controlsPanel.appendChild(screenShareButton);

  // Add panel to page
  document.body.appendChild(controlsPanel);
}

function removeControlsPanel() {
  const existingPanel = document.getElementById("controls-panel");
  if (existingPanel) {
    existingPanel.remove();
  }
}

// Improved handle disconnect to properly clean up all elements
function handleDisconnect() {
  if (!activeRoom) return;

  console.log("Disconnecting from room...");

  try {
    // Disable camera and microphone before disconnecting
    if (activeRoom.localParticipant) {
      activeRoom.localParticipant.setCameraEnabled(false);
      activeRoom.localParticipant.setMicrophoneEnabled(false);

      // Properly detach all tracks and stop them before disconnecting
      activeRoom.localParticipant.tracks.forEach((publication) => {
        if (publication.track) {
          const elements = publication.track.detach();
          elements.forEach((element) => {
            if (element.srcObject) {
              const tracks = element.srcObject.getTracks();
              tracks.forEach((track) => {
                track.stop();
                console.log("Stopped local track:", track.kind);
              });
              element.srcObject = null;
            }
            element.remove();
          });
        }
      });
    }

    // Stop all remote participant tracks too
    activeRoom.participants.forEach((participant) => {
      if (participant.tracks) {
        participant.tracks.forEach((publication) => {
          if (publication.track && publication.track.detach) {
            const elements = publication.track.detach();
            elements.forEach((element) => {
              if (element.srcObject) {
                const tracks = element.srcObject.getTracks();
                tracks.forEach((track) => {
                  track.stop();
                  console.log(
                    `Stopped remote track for ${participant.identity}:`,
                    track.kind
                  );
                });
                element.srcObject = null;
              }
              element.remove();
            });
          }
        });
      }
    });

    // Make sure to clean up any lost video elements
    document.querySelectorAll("video").forEach((videoElement) => {
      if (videoElement.srcObject) {
        const tracks = videoElement.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
        videoElement.srcObject = null;
      }
    });

    // Then disconnect from the room
    activeRoom.disconnect();

    // Clear video container
    videoContainer.innerHTML = "";
    videoContainer.style.display = "none";

    // Update UI
    statusElement.textContent = "Disconnected";
    statusElement.style.backgroundColor = "#95a5a6";

    // Reset join button
    joinButton.textContent = "Join Room";
    joinButton.disabled = false;

    // Clean up event listeners for the join button
    joinButton.removeEventListener("click", handleDisconnect);
    joinButton.addEventListener("click", joinFormClickHandler);

    // Remove controls panel
    removeControlsPanel();

    // Clear audio elements that might be in the document body
    document.querySelectorAll("audio[data-participant]").forEach((el) => {
      if (el.srcObject) {
        const tracks = el.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
        el.srcObject = null;
      }
      el.remove();
    });

    // Reset the active room reference
    activeRoom = null;
    console.log("Disconnected and cleaned up");
  } catch (error) {
    console.error("Error during disconnect:", error);
    // Even if there's an error, we should reset the UI
    resetButtonState();
    activeRoom = null;
    videoContainer.innerHTML = "";
    videoContainer.style.display = "none";
    removeControlsPanel();
  }
}

function resetButtonState() {
  joinButton.disabled = false;
  joinButton.textContent = "Join Room";

  // Make sure we reset the click handler properly
  joinButton.removeEventListener("click", handleDisconnect);
  joinButton.addEventListener("click", joinFormClickHandler);

  // Reset status element
  statusElement.textContent = "";
  statusElement.style.backgroundColor = "";
  statusElement.style.display = "none";
}

// Add a window beforeunload event to clean up when the page is closed
window.addEventListener("beforeunload", () => {
  if (activeRoom) {
    handleDisconnect();
  }
});
