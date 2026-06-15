package com.zoomy.api.room;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

@Service
public class RoomChatStore {

    private final MongoTemplate chatMongo;

    public RoomChatStore(@Qualifier("chatMongoTemplate") MongoTemplate chatMongo) {
        this.chatMongo = chatMongo;
    }

    public RoomChatMessage save(String meetingId, String fromParticipantId, String fromName, String text) {
        RoomChatEntity e = new RoomChatEntity();
        e.setId(UUID.randomUUID().toString());
        e.setMeetingId(meetingId);
        e.setFromParticipantId(fromParticipantId);
        e.setFromName(fromName);
        e.setText(text);
        e.setAt(Instant.now());
        chatMongo.save(e);
        return new RoomChatMessage(e.getId(), e.getMeetingId(), e.getFromParticipantId(), e.getFromName(), e.getText(), e.getAt());
    }

    public List<RoomChatMessage> recent(String meetingId, int limit) {
        int n = Math.max(1, Math.min(limit, 200));
        Query q = Query.query(Criteria.where("meetingId").is(meetingId))
            .with(Sort.by(Sort.Direction.DESC, "at"))
            .limit(n);
        List<RoomChatEntity> rows = chatMongo.find(q, RoomChatEntity.class);
        // UI generally expects chronological order.
        rows.sort((a, b) -> a.getAt().compareTo(b.getAt()));
        return rows.stream().map(e -> new RoomChatMessage(
            e.getId(), e.getMeetingId(), e.getFromParticipantId(), e.getFromName(), e.getText(), e.getAt()
        )).toList();
    }
}
