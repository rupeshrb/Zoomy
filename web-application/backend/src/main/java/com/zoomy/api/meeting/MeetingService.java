package com.zoomy.api.meeting;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.zoomy.api.common.ApiException;

@Service
public class MeetingService {

    private static final char[] LETTERS = "abcdefghijkmnopqrstuvwxyz".toCharArray();
    private static final SecureRandom RND = new SecureRandom();

    private final MeetingRepository meetings;
    private final PasswordEncoder passwords;

    public MeetingService(MeetingRepository meetings, PasswordEncoder passwords) {
        this.meetings = meetings;
        this.passwords = passwords;
    }

    public Meeting create(String hostId, String hostName, Meeting.Mode mode, String title) {
        String code;
        do { code = generateCode(); } while (meetings.findByCode(code).isPresent());

        Meeting m = new Meeting();
        m.setId(code.replace("-", ""));
        m.setCode(code);
        m.setMode(mode == null ? Meeting.Mode.NORMAL : mode);
        m.setHostId(hostId);
        m.setHostName(hostName);
        m.setTitle((title == null || title.isBlank())
            ? (mode == Meeting.Mode.INTERVIEW ? "Interview meeting" : "Meeting") : title);
        m.setStatus(Meeting.Status.ACTIVE);
        m.setLobbyEnabled(true);
        m.setPasswordEnabled(false);
        m.setPasswordHash(null);
        m.setCreatedAt(Instant.now());
        m.setUpdatedAt(Instant.now());
        return meetings.save(m);
    }

    public Meeting resolve(String idOrCode) {
        if (idOrCode == null || idOrCode.isBlank()) {
            throw new ApiException(400, "Code is required");
        }
        String key = idOrCode.replaceAll("[^a-z0-9]", "").toLowerCase();
        // try id first, then code
        return meetings.findById(key)
            .or(() -> meetings.findByCode(formatCode(key)))
            .orElseThrow(() -> new ApiException(404, "Meeting not found"));
    }

    public Meeting end(String id, String hostId) {
        Meeting m = meetings.findById(id)
            .orElseThrow(() -> new ApiException(404, "Meeting not found"));
        if (!m.getHostId().equals(hostId)) {
            throw new ApiException(403, "Only the host can end the meeting");
        }
        m.setStatus(Meeting.Status.ENDED);
        m.setEndedAt(Instant.now());
        m.setUpdatedAt(Instant.now());
        return meetings.save(m);
    }

    public Meeting configurePassword(String id, String hostId, boolean enabled, String rawPassword) {
        Meeting m = meetings.findById(id)
            .orElseThrow(() -> new ApiException(404, "Meeting not found"));
        if (!m.getHostId().equals(hostId)) {
            throw new ApiException(403, "Only the host can change meeting password");
        }

        if (!enabled) {
            m.setPasswordEnabled(false);
            m.setPasswordHash(null);
            m.setUpdatedAt(Instant.now());
            return meetings.save(m);
        }

        String pwd = rawPassword == null ? "" : rawPassword.trim();
        if (pwd.length() < 4 || pwd.length() > 32) {
            throw new ApiException(400, "Password must be between 4 and 32 characters");
        }

        m.setPasswordEnabled(true);
        m.setPasswordHash(passwords.encode(pwd));
        m.setUpdatedAt(Instant.now());
        return meetings.save(m);
    }

    public void assertLobbyAccess(String id, String userId, String rawPassword) {
        Meeting m = meetings.findById(id)
            .orElseThrow(() -> new ApiException(404, "Meeting not found"));

        if (m.getStatus() != Meeting.Status.ACTIVE) {
            throw new ApiException(409, "Meeting is not active");
        }

        // Host never needs to re-enter meeting password.
        if (userId != null && userId.equals(m.getHostId())) return;

        if (!m.isPasswordEnabled()) return;

        String supplied = rawPassword == null ? "" : rawPassword;
        if (supplied.isBlank() || m.getPasswordHash() == null || !passwords.matches(supplied, m.getPasswordHash())) {
            throw new ApiException(403, "Invalid meeting password");
        }
    }

    /**
     * Persist participant presence history into the meeting document.
     * Room state itself remains in Redis for low-latency fanout.
     */
    public void markParticipantJoined(String meetingId, String userId, String name, String role) {
        if (userId == null || userId.isBlank()) return;
        Meeting m = meetings.findById(meetingId)
            .orElseThrow(() -> new ApiException(404, "Meeting not found"));

        Instant now = Instant.now();
        Meeting.Participant active = m.getParticipants().stream()
            .filter(p -> userId.equals(p.getUserId()) && p.getLeftAt() == null)
            .findFirst()
            .orElse(null);

        if (active == null) {
            Meeting.Participant p = new Meeting.Participant();
            p.setUserId(userId);
            p.setName(name);
            p.setRole(role);
            p.setJoinedAt(now);
            p.setLeftAt(null);
            m.getParticipants().add(p);
        } else {
            if (name != null && !name.isBlank()) active.setName(name);
            if (role != null && !role.isBlank()) active.setRole(role);
            active.setLeftAt(null);
        }

        m.setUpdatedAt(now);
        meetings.save(m);
    }

    public void markParticipantLeft(String meetingId, String userId) {
        if (userId == null || userId.isBlank()) return;
        Meeting m = meetings.findById(meetingId)
            .orElseThrow(() -> new ApiException(404, "Meeting not found"));

        Instant now = Instant.now();
        List<Meeting.Participant> ps = m.getParticipants();
        for (int i = ps.size() - 1; i >= 0; i--) {
            Meeting.Participant p = ps.get(i);
            if (userId.equals(p.getUserId()) && p.getLeftAt() == null) {
                p.setLeftAt(now);
                break;
            }
        }

        m.setUpdatedAt(now);
        meetings.save(m);
    }

    // ---- helpers ----

    private static String generateCode() {
        return seg(3) + "-" + seg(4) + "-" + seg(3);
    }
    private static String seg(int n) {
        StringBuilder sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) sb.append(LETTERS[RND.nextInt(LETTERS.length)]);
        return sb.toString();
    }
    private static String formatCode(String compact) {
        // best-effort: only formats 10-char ids back to abc-defg-hij
        if (compact.length() != 10) return compact;
        return compact.substring(0,3) + "-" + compact.substring(3,7) + "-" + compact.substring(7);
    }
}
