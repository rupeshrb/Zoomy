package com.zoomy.api.meeting.dto;

import com.zoomy.api.meeting.Meeting;

public record CreateMeetingRequest(Meeting.Mode mode, String title) {}
