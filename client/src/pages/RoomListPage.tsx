import { useState, useEffect } from "react";
import { useAuth } from "../context/useAuth";
import { useWs } from "../context/useWs";
import { useRooms } from "../hooks/useRooms";
import {
  apiJoinByCode,
  apiGetInvitations,
  apiAcceptInvitation,
  apiInviteUser,
  apiSearchUsers,
  apiRegenerateCode,
} from "../api";
import type { RoomPayload, InvitationPayload, UserPayload } from "../../../shared/types";

type Props = {
  onEnterRoom: (room: RoomPayload) => void;
};

export default function RoomListPage({ onEnterRoom }: Props) {
  const { auth, logout } = useAuth();
  const { lastMessage } = useWs();
  const { rooms, createRoom, joinRoom, addRoom } = useRooms(
    auth?.token ?? null,
    auth?.user.id ?? null,
    lastMessage
  );

  const [tab, setTab] = useState<"rooms" | "invitations">("rooms");
  const [newRoomName, setNewRoomName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [invitations, setInvitations] = useState<InvitationPayload[]>([]);

  // Room settings panel state
  const [settingsRoom, setSettingsRoom] = useState<RoomPayload | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserPayload[]>([]);
  const [inviteMsg, setInviteMsg] = useState("");
  const [currentCode, setCurrentCode] = useState("");

  // Load pending invitations
  useEffect(() => {
    if (!auth || tab !== "invitations") return;
    apiGetInvitations(auth.token).then(setInvitations).catch(console.error);
  }, [auth, tab]);

  // User search for invite
  useEffect(() => {
    if (!auth || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      apiSearchUsers(auth.token, searchQuery)
        .then(setSearchResults)
        .catch(console.error);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, auth]);

  // Open settings panel for a room
  function openSettings(e: React.MouseEvent, room: RoomPayload) {
    e.stopPropagation();
    setSettingsRoom(room);
    setCurrentCode(room.inviteCode ?? "");
    setSearchQuery("");
    setSearchResults([]);
    setInviteMsg("");
  }

  async function handleCreate() {
    if (!newRoomName.trim()) return;
    setError("");
    setLoading(true);
    try {
      await createRoom(newRoomName.trim());
      setNewRoomName("");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinByCode() {
    if (!auth || !inviteCode.trim()) return;
    setError("");
    setLoading(true);
    try {
      const room = await apiJoinByCode(auth.token, inviteCode.trim());
      addRoom(room);
      setInviteCode("");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept(inv: InvitationPayload) {
    if (!auth) return;
    try {
      const room = await apiAcceptInvitation(auth.token, inv.id);
      addRoom(room);
      setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }

  async function handleInvite(username: string) {
    if (!auth || !settingsRoom) return;
    try {
      await apiInviteUser(auth.token, settingsRoom.id, username);
      setInviteMsg(`Invitation sent to ${username}`);
      setSearchQuery("");
      setSearchResults([]);
    } catch (err: unknown) {
      setInviteMsg((err as Error).message);
    }
  }

  async function handleRegenCode() {
    if (!auth || !settingsRoom) return;
    try {
      const code = await apiRegenerateCode(auth.token, settingsRoom.id);
      setCurrentCode(code);
    } catch (err: unknown) {
      setInviteMsg((err as Error).message);
    }
  }

 function handleJoinAndEnter(room: RoomPayload) {
  joinRoom(room);
  onEnterRoom(room);
}

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-base font-semibold text-gray-800">Chat Rooms</h1>
          <p className="text-xs text-gray-400">Welcome, {auth?.user.username}</p>
        </div>
        <button
          onClick={logout}
          className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition"
        >
          Sign out
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        {(["rooms", "invitations"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium transition ${
              tab === t
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {t === "rooms" ? "Rooms" : `Invitations${invitations.length > 0 ? ` (${invitations.length})` : ""}`}
          </button>
        ))}
      </div>

      <div className="flex-1 max-w-lg w-full mx-auto p-4 flex flex-col gap-4">
        {error && (
          <div className="bg-red-50 text-red-500 text-xs rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {tab === "rooms" && (
          <>
            {/* Create room */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-sm font-medium text-gray-700 mb-3">Create a room</p>
              <div className="flex gap-2">
                <input
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="Room name..."
                  className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                />
                <button
                  onClick={handleCreate}
                  disabled={loading || !newRoomName.trim()}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium rounded-xl transition"
                >
                  {loading ? "..." : "Create"}
                </button>
              </div>
            </div>

            {/* Join by code */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-sm font-medium text-gray-700 mb-3">Join with invite code</p>
              <div className="flex gap-2">
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinByCode()}
                  placeholder="e.g. A1B2C3"
                  maxLength={6}
                  className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition font-mono tracking-widest"
                />
                <button
                  onClick={handleJoinByCode}
                  disabled={loading || inviteCode.length < 6}
                  className="px-4 py-2 bg-teal-500 hover:bg-teal-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium rounded-xl transition"
                >
                  Join
                </button>
              </div>
            </div>

            {/* Room list */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <p className="text-sm font-medium text-gray-700 px-4 pt-4 pb-2">
                Your rooms
              </p>
              {rooms.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  No rooms yet. Create one or use an invite code.
                </p>
              ) : (
                <ul>
                  {rooms.map((room, i) => (
                    <li
                      key={room.id}
                      className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition ${
                        i !== rooms.length - 1 ? "border-b border-gray-100" : ""
                      }`}
                       onClick={() => handleJoinAndEnter(room)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
                          {room.name[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {room.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {room.isOwner ? "Owner" : "Member"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {room.unreadCount > 0 && (
                          <span className="bg-blue-500 text-white text-xs font-semibold rounded-full px-2 py-0.5 min-w-[20px] text-center">
                            {room.unreadCount}
                          </span>
                        )}
                        {room.isOwner && (
                          <button
                            onClick={(e) => openSettings(e, room)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
                            title="Room settings"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {tab === "invitations" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <p className="text-sm font-medium text-gray-700 px-4 pt-4 pb-2">
              Pending invitations
            </p>
            {invitations.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                No pending invitations.
              </p>
            ) : (
              <ul>
                {invitations.map((inv, i) => (
                  <li
                    key={inv.id}
                    className={`flex items-center justify-between px-4 py-3 ${
                      i !== invitations.length - 1 ? "border-b border-gray-100" : ""
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {inv.roomName}
                      </p>
                      <p className="text-xs text-gray-400">
                        Invited by {inv.invitedBy}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAccept(inv)}
                      className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition"
                    >
                      Accept
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Room settings panel */}
      {settingsRoom && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => setSettingsRoom(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-800">
                {settingsRoom.name} — Settings
              </h2>
              <button
                onClick={() => setSettingsRoom(null)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Invite code */}
            <div className="mb-5">
              <p className="text-xs font-medium text-gray-500 mb-2">Invite code</p>
              <div className="flex items-center gap-2">
                <span className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-mono text-base tracking-widest text-center text-gray-800">
                  {currentCode}
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(currentCode)}
                  className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition"
                  title="Copy code"
                >
                  Copy
                </button>
                <button
                  onClick={handleRegenCode}
                  className="px-3 py-2 text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl transition"
                  title="Regenerate"
                >
                  New
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Share this code with people you want to invite.
              </p>
            </div>

            {/* Invite by username */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">
                Invite by username
              </p>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search username..."
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition mb-2"
              />
              {searchResults.length > 0 && (
                <ul className="border border-gray-100 rounded-xl overflow-hidden mb-2">
                  {searchResults.map((user, i) => (
                    <li
                      key={user.id}
                      className={`flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition ${
                        i !== searchResults.length - 1 ? "border-b border-gray-100" : ""
                      }`}
                    >
                      <span className="text-sm text-gray-700">{user.username}</span>
                      <button
                        onClick={() => handleInvite(user.username)}
                        className="text-xs px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition"
                      >
                        Invite
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {inviteMsg && (
                <p className={`text-xs mt-1 ${
                  inviteMsg.startsWith("Invitation sent")
                    ? "text-green-600"
                    : "text-red-500"
                }`}>
                  {inviteMsg}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}