package com.zoomy.api.meeting;

import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface MeetingRepository extends MongoRepository<Meeting, String> {
    Optional<Meeting> findByCode(String code);
}
