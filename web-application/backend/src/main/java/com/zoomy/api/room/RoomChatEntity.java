package com.zoomy.api.room;

import java.time.Instant;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "messages")
@CompoundIndex(name = "idx_chat_meeting_time", def = "{'meetingId': 1, 'at': -1}")
public class RoomChatEntity {

    @Id
    private String id;
    private String meetingId;
    private String fromParticipantId;
    private String fromName;
    private String text;
    private Instant at;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getMeetingId() { return meetingId; }
    public void setMeetingId(String meetingId) { this.meetingId = meetingId; }
    public String getFromParticipantId() { return fromParticipantId; }
    public void setFromParticipantId(String fromParticipantId) { this.fromParticipantId = fromParticipantId; }
    public String getFromName() { return fromName; }
    public void setFromName(String fromName) { this.fromName = fromName; }
    public String getText() { return text; }
    public void setText(String text) { this.text = text; }
    public Instant getAt() { return at; }
    public void setAt(Instant at) { this.at = at; }
}
