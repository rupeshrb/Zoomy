package com.zoomy.api.proctor;

import com.zoomy.api.events.ProctorEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;

@RestController
@RequestMapping("/proctor")
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "zoomy.proctor", name = "enabled", havingValue = "true")
class ProctorController {

    private final KafkaTemplate<String, ProctorEvent> kafka;
    @Value("${zoomy.topics.proctor-events}") String topic;

    @PostMapping("/events")
    public void ingest(@RequestBody ProctorEvent event) {
        ProctorEvent stamped = new ProctorEvent(
                event.sessionId(), event.candidateId(),
                event.source(), event.kind(), event.severity(), event.message(),
                event.occurredAt() == null ? Instant.now() : event.occurredAt());
        kafka.send(topic, stamped.sessionId(), stamped);
    }
}

@Service
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "zoomy.proctor", name = "enabled", havingValue = "true")
class ProctorEventConsumer {

    private final SimpMessagingTemplate ws;
    private final StringRedisTemplate redis;

    @KafkaListener(topics = "${zoomy.topics.proctor-events}", containerFactory = "kafkaListenerContainerFactory")
    public void onEvent(ProctorEvent e) {
        // Rolling counter per session+kind for the last 5 minutes
        String key = "proctor:%s:%s".formatted(e.sessionId(), e.kind());
        Long n = redis.opsForValue().increment(key);
        if (n != null && n == 1L) redis.expire(key, Duration.ofMinutes(5));

        // Push alert to interviewer subscribed to /topic/session/{id}
        ws.convertAndSend("/topic/session/" + e.sessionId(), e);

        if (e.severity() == ProctorEvent.Severity.CRITICAL) {
            log.warn("CRITICAL proctor event session={} kind={} msg={}",
                    e.sessionId(), e.kind(), e.message());
        }
    }
}
