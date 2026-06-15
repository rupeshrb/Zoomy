package com.zoomy.api.meeting;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.zoomy.api.auth.AuthService;
import com.zoomy.api.auth.User;
import com.zoomy.api.common.ApiException;
import com.zoomy.api.grpc.SafeAgentRegistry;
import com.zoomy.api.meeting.dto.MeetingAccessRequest;
import com.zoomy.api.meeting.dto.MeetingAccessResponse;
import com.zoomy.api.meeting.dto.CreateMeetingRequest;
import com.zoomy.api.meeting.dto.MeetingDto;
import com.zoomy.api.meeting.dto.MeetingPasswordSettingsRequest;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/meetings")
public class MeetingController {

    private final MeetingService meetings;
    private final AuthService auth;
    private final SafeAgentRegistry safeAgents;

    public MeetingController(MeetingService meetings, AuthService auth, SafeAgentRegistry safeAgents) {
        this.meetings = meetings; this.auth = auth; this.safeAgents = safeAgents;
    }

    @PostMapping
    public MeetingDto create(@Valid @RequestBody CreateMeetingRequest req, Authentication a) {
        String userId = requireUserId(a);
        User u = auth.byId(userId).orElseThrow(() -> new ApiException(401, "Not authenticated"));
        Meeting m = meetings.create(u.getId(), u.getName(), req.mode(), req.title());
        return MeetingDto.from(m);
    }

    /** Public resolve: lets join page look up meeting metadata before requiring auth. */
    @GetMapping("/resolve")
    public MeetingDto resolve(@RequestParam("code") String code) {
        return MeetingDto.from(meetings.resolve(code));
    }

    @GetMapping("/{id}")
    public MeetingDto get(@PathVariable String id) {
        return MeetingDto.from(meetings.resolve(id));
    }

    @PostMapping("/{id}/end")
    public MeetingDto end(@PathVariable String id, Authentication a) {
        return MeetingDto.from(meetings.end(id, requireUserId(a)));
    }

    /** Host can enable/disable password and set custom/random password value. */
    @PostMapping("/{id}/password")
    public MeetingDto setPassword(@PathVariable String id,
                                  @RequestBody MeetingPasswordSettingsRequest req,
                                  Authentication a) {
        Meeting m = meetings.configurePassword(id, requireUserId(a), req.enabled(), req.password());
        return MeetingDto.from(m);
    }

    /** Checks whether the authenticated user can enter the meeting lobby/room. */
    @PostMapping("/{id}/access")
    public MeetingAccessResponse checkAccess(@PathVariable String id,
                                             @RequestBody(required = false) MeetingAccessRequest req,
                                             Authentication a) {
        meetings.assertLobbyAccess(id, requireUserId(a), req == null ? null : req.password());
        return new MeetingAccessResponse(true);
    }

    /**
     * Whether THIS authenticated user's desktop Safe Agent is connected for the
     * meeting. The browser polls this to release the interview join gate
     * (companion-agent model: the meeting runs in the browser, anti-cheat runs
     * in the JavaFX agent over gRPC).
     */
    @GetMapping("/{id}/safe-agent")
    public SafeAgentStatus safeAgentStatus(@PathVariable String id, Authentication a) {
        String userId = requireUserId(a);
        SafeAgentRegistry.AgentSession s = safeAgents.find(id, userId);
        if (s == null) return new SafeAgentStatus(false, 0, 0);
        return new SafeAgentStatus(true, s.lastSeen(), s.monitorCount());
    }

    public record SafeAgentStatus(boolean connected, long lastSeen, int monitorCount) {}

    private String requireUserId(Authentication a) {
        if (a == null || a.getPrincipal() == null) throw new ApiException(401, "Not authenticated");
        return a.getPrincipal().toString();
    }
}
