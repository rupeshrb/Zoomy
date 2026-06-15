package com.zoomy.api.meeting;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "meetings")
public class Meeting {

    public enum Mode { NORMAL, INTERVIEW }
    public enum Status { ACTIVE, ENDED }

    @Id
    private String id;          // == code with dashes stripped

    @Indexed(unique = true)
    private String code;        // e.g. "abc-defg-hij"

    private Mode mode;
    private Status status = Status.ACTIVE;

    private String hostId;
    private String hostName;
    private String title;

    private List<Participant> participants = new ArrayList<>();

    private boolean lobbyEnabled = true;
    private boolean recordingEnabled;
    private boolean passwordEnabled;
    private String passwordHash;

    private Instant createdAt;
    private Instant updatedAt;
    private Instant endedAt;

    public static class Participant {
        private String userId;
        private String name;
        private String role;   // HOST | GUEST | CANDIDATE
        private Instant joinedAt;
        private Instant leftAt;

        public String getUserId() { return userId; }
        public void setUserId(String userId) { this.userId = userId; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }
        public Instant getJoinedAt() { return joinedAt; }
        public void setJoinedAt(Instant joinedAt) { this.joinedAt = joinedAt; }
        public Instant getLeftAt() { return leftAt; }
        public void setLeftAt(Instant leftAt) { this.leftAt = leftAt; }
    }

    // getters/setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public Mode getMode() { return mode; }
    public void setMode(Mode mode) { this.mode = mode; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public String getHostId() { return hostId; }
    public void setHostId(String hostId) { this.hostId = hostId; }
    public String getHostName() { return hostName; }
    public void setHostName(String hostName) { this.hostName = hostName; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public List<Participant> getParticipants() { return participants; }
    public void setParticipants(List<Participant> participants) { this.participants = participants; }
    public boolean isLobbyEnabled() { return lobbyEnabled; }
    public void setLobbyEnabled(boolean lobbyEnabled) { this.lobbyEnabled = lobbyEnabled; }
    public boolean isRecordingEnabled() { return recordingEnabled; }
    public void setRecordingEnabled(boolean v) { this.recordingEnabled = v; }
    public boolean isPasswordEnabled() { return passwordEnabled; }
    public void setPasswordEnabled(boolean passwordEnabled) { this.passwordEnabled = passwordEnabled; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public Instant getEndedAt() { return endedAt; }
    public void setEndedAt(Instant endedAt) { this.endedAt = endedAt; }
}
