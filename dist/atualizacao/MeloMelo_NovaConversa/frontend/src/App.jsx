import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Search,
  Send,
  MessageCircle,
  User,
  Users,
  MoreVertical,
  CheckCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Paperclip,
  FileText,
  Smile,
  Settings,
  Building2,
  UserPlus,
  ShieldCheck,
  Plus,
  Power,
  X,
  RefreshCw,
  Pencil,
  Save,
  CheckCircle,
  Zap,
  Trash2,
  Archive,
} from "lucide-react";

const API_URL = "";

const api = axios.create({
  baseURL: API_URL,
});

function formatConversationDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMessageDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return "Hoje";
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    return "Ontem";
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function isSameCalendarDay(dateA, dateB) {
  if (!dateA || !dateB) {
    return false;
  }

  const first = new Date(dateA);
  const second = new Date(dateB);

  if (
    Number.isNaN(first.getTime()) ||
    Number.isNaN(second.getTime())
  ) {
    return false;
  }

  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}


function normalizeMediaType(messageType) {
  const type = String(messageType || "").toLowerCase();

  if (type.includes("image")) return "image";
  if (type.includes("video")) return "video";
  if (type.includes("audio")) return "audio";
  if (type.includes("document")) return "document";
  if (type.includes("sticker")) return "sticker";

  return null;
}

function MediaMessage({ message }) {
  const [media, setMedia] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const mediaType = normalizeMediaType(message.message_type);

  useEffect(() => {
    let cancelled = false;

    async function loadMedia() {
      if (!message.external_id || !mediaType) {
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await api.get(
          `/api/groups/media/${encodeURIComponent(message.external_id)}`
        );

        if (!cancelled) {
          setMedia(response.data);
        }
      } catch (requestError) {
        console.error("Erro ao carregar mídia:", requestError);

        if (!cancelled) {
          setError("Não foi possível carregar esta mídia.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMedia();

    return () => {
      cancelled = true;
    };
  }, [message.external_id, mediaType]);

  if (!mediaType) {
    return null;
  }

  if (loading) {
    return (
      <div
        style={{
          padding: "10px 12px",
          borderRadius: "10px",
          background: "rgba(0,0,0,0.04)",
          fontSize: "12px",
          color: "#667781",
        }}
      >
        Carregando mídia...
      </div>
    );
  }

  if (error || !media?.dataUrl) {
    return (
      <div
        style={{
          padding: "10px 12px",
          borderRadius: "10px",
          background: "rgba(0,0,0,0.04)",
          fontSize: "12px",
          color: "#667781",
        }}
      >
        {error || "Mídia indisponível"}
      </div>
    );
  }

  if (mediaType === "image" || mediaType === "sticker") {
    return (
      <div>
        <img
          src={media.dataUrl}
          alt="Mídia recebida"
          style={{
            display: "block",
            maxWidth: "320px",
            maxHeight: "420px",
            width: "auto",
            height: "auto",
            borderRadius: "10px",
            objectFit: "contain",
          }}
        />
      </div>
    );
  }

  if (mediaType === "video") {
    return (
      <video
        controls
        preload="metadata"
        src={media.dataUrl}
        style={{
          display: "block",
          maxWidth: "360px",
          maxHeight: "420px",
          borderRadius: "10px",
        }}
      />
    );
  }

  if (mediaType === "audio") {
    return (
      <audio
        controls
        preload="metadata"
        src={media.dataUrl}
        style={{
          width: "280px",
          maxWidth: "100%",
        }}
      />
    );
  }

  return (
    <a
      href={media.dataUrl}
      download={media.fileName || "documento"}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 12px",
        borderRadius: "10px",
        background: "rgba(0,0,0,0.05)",
        color: "inherit",
        textDecoration: "none",
        fontWeight: 600,
        fontSize: "12px",
      }}
    >
      <FileText size={18} />
      {media.fileName || "Abrir documento"}
    </a>
  );
}

function renderMessageText(content) {
  const value = String(content ?? "");
  const signature = value.match(/^\*([^*\n]+)\*([\s\S]*)$/);
  if (!signature) return value;
  return (
    <>
      <strong className="message-signature">{signature[1]}</strong>
      {signature[2]}
    </>
  );
}

function profilePictureKey(value) {
  const raw = String(value || "").trim();
  if (/@g\.us$/i.test(raw)) return raw;
  return raw.replace(/\D/g, "");
}

function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem("melo_token") || ""
  );
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("melo_theme_mode") === "dark");
  const [themeColors, setThemeColors] = useState(() => {
    try { return JSON.parse(localStorage.getItem("melo_theme_colors") || '{"background":"#eaf0f5","chat":"#ffffff","bubble":"#d9fdd3"}'); }
    catch { return { background: "#eaf0f5", chat: "#ffffff", bubble: "#d9fdd3" }; }
  });
  const [showAppearance, setShowAppearance] = useState(false);
  const [contactEditing, setContactEditing] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [contactSaving, setContactSaving] = useState(false);

  // Nova conversa: contatos da agenda do WhatsApp ou número digitado.
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [whatsappContacts, setWhatsappContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualContactName, setManualContactName] = useState("");
  const [newConversationLoading, setNewConversationLoading] = useState(false);


  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("melo_user");
    return saved ? JSON.parse(saved) : null;
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Administração de usuários e departamentos (somente administrador).
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminDepartments, setAdminDepartments] = useState([]);
  const [adminGroups, setAdminGroups] = useState([]);
  const [groupDepartmentDrafts, setGroupDepartmentDrafts] = useState({});
  const [availableDepartments, setAvailableDepartments] = useState([]);
  const [departmentSaving, setDepartmentSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminNotice, setAdminNotice] = useState("");
  const [adminView, setAdminView] = useState("users");
  const [botMappings, setBotMappings] = useState([]);
  const [quickReplies, setQuickReplies] = useState([]);
  const [newQuickReplyTitle, setNewQuickReplyTitle] = useState("");
  const [newQuickReplyBody, setNewQuickReplyBody] = useState("");
  const [quickReplyOpen, setQuickReplyOpen] = useState(false);
  const [quickReplyLoading, setQuickReplyLoading] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [newUser, setNewUser] = useState({
    name: "", email: "", password: "", role: "agent", department_id: ""
  });
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingUserForm, setEditingUserForm] = useState({
    name: "", email: "", role: "agent", department_id: "", password: ""
  });

  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] =
    useState(null);
  const [messages, setMessages] = useState([]);

  const [activeTab, setActiveTab] = useState("conversations");
  const [groups, setGroups] = useState([]);
  const [profilePictures, setProfilePictures] = useState({});
  const profilePictureRequestsRef = useRef(new Map());
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMessages, setGroupMessages] = useState([]);
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const composerTextRef = useRef(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [mediaSending, setMediaSending] = useState(false);
  const mediaInputRef = useRef(null);

  const groupMessagesRef = useRef(null);
  const conversationMessagesRef = useRef(null);

  useEffect(() => {
    if (token) {
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      delete api.defaults.headers.common.Authorization;
    }
  }, [token]);

  async function handleLogin(event) {
    event.preventDefault();

    setLoginError("");
    setLoginLoading(true);

    try {
      const response = await api.post("/api/auth/login", {
        email: email.trim(),
        password,
      });

      const receivedToken = response.data.token;
      const receivedUser = response.data.user;

      localStorage.setItem("melo_token", receivedToken);
      localStorage.setItem(
        "melo_user",
        JSON.stringify(receivedUser)
      );

      setToken(receivedToken);
      setUser(receivedUser);
    } catch (error) {
      console.error("Erro no login:", error);

      setLoginError(
        error.response?.data?.message ||
          "E-mail ou senha invÃ¡lidos."
      );
    } finally {
      setLoginLoading(false);
    }
  }

  async function saveGroupDepartments(groupId) {
    try {
      const department_ids = groupDepartmentDrafts[String(groupId)] || [];
      await api.patch(`/api/groups/${groupId}/departments`, { department_ids });
      setAdminNotice("Departamentos do grupo atualizados com sucesso.");
      await loadGroups();
      await loadAdminData();
    } catch (error) {
      setAdminError(error.response?.data?.error || "Não foi possível salvar os departamentos do grupo.");
    }
  }

  async function loadAdminData() {
    setAdminLoading(true);
    setAdminError("");
    try {
      const [usersResponse, departmentsResponse, botResponse, repliesResponse, groupsResponse] = await Promise.all([
        api.get("/api/users"),
        api.get("/api/departments"),
        api.get("/api/bot/config"),
        api.get("/api/bot/quick-replies"),
        api.get("/api/groups"),
      ]);
      setAdminUsers(usersResponse.data);
      setAdminDepartments(departmentsResponse.data);
      setAdminGroups(groupsResponse.data || []);
      setGroupDepartmentDrafts(Object.fromEntries((groupsResponse.data || []).map(group => [String(group.id), (group.department_ids || (group.department_id ? [group.department_id] : [])).map(Number)])));
      const savedMappings = (botResponse.data?.mappings || []).map(item => ({ number: String(item.reply_number), department_ids: (item.department_ids || []).map(Number) }));
      setBotMappings(savedMappings.length ? savedMappings : departmentsResponse.data.filter(d => d.active).map((d, index) => ({ number: String(index + 1), department_ids: [Number(d.id)] })));
      setQuickReplies(repliesResponse.data || []);
    } catch (error) {
      console.error("Erro ao carregar administração:", error);
      setAdminError(
        error.response?.data?.message ||
        "Não foi possível carregar usuários e departamentos."
      );
    } finally {
      setAdminLoading(false);
    }
  }

  useEffect(() => {
    if (token && activeTab === "admin" && user?.role === "admin") {
      loadAdminData();
    }
  }, [token, activeTab, user?.role]);

  useEffect(() => {
    if (token) loadQuickReplies();
  }, [token]);

  useEffect(() => {
    if (!token) {
      setAvailableDepartments([]);
      return;
    }
    api.get("/api/departments")
      .then((response) => setAvailableDepartments(response.data || []))
      .catch((error) => console.error("Erro ao carregar departamentos do perfil:", error));
  }, [token]);

  async function assignConversationDepartment(departmentValue) {
    if (!selectedConversation || user?.role !== "admin") return;
    const departmentId = departmentValue ? Number(departmentValue) : null;
    setDepartmentSaving(true);
    setProfileNotice("");
    try {
      const response = await api.patch(
        `/api/conversations/${selectedConversation.id}/department`,
        { department_id: departmentId }
      );
      const updated = {
        ...selectedConversation,
        department_id: response.data.department_id,
        department_name: response.data.department_name,
      };
      setSelectedConversation(updated);
      setConversations((current) => current.map((item) =>
        item.id === updated.id
          ? { ...item, department_id: updated.department_id, department_name: updated.department_name }
          : item
      ));
      setProfileNotice("Departamento atualizado com sucesso.");
    } catch (error) {
      setProfileNotice(error.response?.data?.message || "Não foi possível atualizar o departamento.");
    } finally {
      setDepartmentSaving(false);
    }
  }

  async function assignGroupDepartment(departmentValue) {
    if (!selectedGroup || user?.role !== "admin") return;
    const departmentId = departmentValue ? Number(departmentValue) : null;
    setDepartmentSaving(true);
    setProfileNotice("");
    try {
      const response = await api.patch(
        `/api/groups/${selectedGroup.id}/department`,
        { department_id: departmentId }
      );
      const updated = {
        ...selectedGroup,
        department_id: response.data.department_id,
        department_name: response.data.department_name,
      };
      setSelectedGroup(updated);
      setGroups((current) => current.map((item) =>
        item.id === updated.id
          ? { ...item, department_id: updated.department_id, department_name: updated.department_name }
          : item
      ));
      setProfileNotice("Departamento do grupo atualizado com sucesso.");
    } catch (error) {
      setProfileNotice(error.response?.data?.message || error.response?.data?.error || "Não foi possível atualizar o departamento do grupo.");
    } finally {
      setDepartmentSaving(false);
    }
  }

  async function createDepartment(event) {
    event.preventDefault();
    setAdminError("");
    setAdminNotice("");
    try {
      await api.post("/api/departments", { name: newDepartmentName.trim() });
      setNewDepartmentName("");
      setAdminNotice("Departamento criado com sucesso.");
      await loadAdminData();
    } catch (error) {
      setAdminError(error.response?.data?.message || "Não foi possível criar o departamento.");
    }
  }

  async function toggleDepartment(department) {
    setAdminError("");
    setAdminNotice("");
    try {
      await api.patch(`/api/departments/${department.id}/status`, {
        active: !department.active,
      });
      setAdminNotice(`Departamento ${department.active ? "desativado" : "ativado"} com sucesso.`);
      await loadAdminData();
    } catch (error) {
      setAdminError(error.response?.data?.message || "Não foi possível alterar o departamento.");
    }
  }

  async function renameDepartment(department) {
    const name = window.prompt("Novo nome do departamento:", department.name);
    if (name === null || !name.trim() || name.trim() === department.name) return;
    setAdminError("");
    setAdminNotice("");
    try {
      await api.put(`/api/departments/${department.id}`, { name: name.trim() });
      setAdminNotice("Departamento atualizado com sucesso.");
      await loadAdminData();
    } catch (error) {
      setAdminError(error.response?.data?.message || "Não foi possível renomear o departamento.");
    }
  }

  async function createUser(event) {
    event.preventDefault();
    setAdminError("");
    setAdminNotice("");
    try {
      await api.post("/api/users", {
        ...newUser,
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        department_id: newUser.department_id || null,
      });
      setNewUser({ name: "", email: "", password: "", role: "agent", department_id: "" });
      setAdminNotice("Usuário criado com sucesso.");
      await loadAdminData();
    } catch (error) {
      setAdminError(error.response?.data?.message || "Não foi possível criar o usuário.");
    }
  }

  async function toggleUser(userItem) {
    setAdminError("");
    setAdminNotice("");
    try {
      await api.patch(`/api/users/${userItem.id}/status`, { active: !userItem.active });
      setAdminNotice(`Usuário ${userItem.active ? "desativado" : "ativado"} com sucesso.`);
      await loadAdminData();
    } catch (error) {
      setAdminError(error.response?.data?.message || "Não foi possível alterar o usuário.");
    }
  }

  function startEditUser(userItem) {
    setEditingUserId(userItem.id);
    setEditingUserForm({
      name: userItem.name || "",
      email: userItem.email || "",
      role: userItem.role || "agent",
      department_id: userItem.department_id ? String(userItem.department_id) : "",
      password: "",
    });
    setAdminError("");
    setAdminNotice("");
  }

  async function saveEditedUser(event) {
    event.preventDefault();
    setAdminError("");
    setAdminNotice("");
    try {
      const payload = {
        ...editingUserForm,
        department_id: editingUserForm.department_id || null,
      };
      if (!payload.password) delete payload.password;
      await api.put(`/api/users/${editingUserId}`, payload);
      setEditingUserId(null);
      setAdminNotice("Usuário atualizado com sucesso.");
      await loadAdminData();
    } catch (error) {
      setAdminError(error.response?.data?.message || "Não foi possível atualizar o usuário.");
    }
  }

  function addBotMappingRow() {
    setBotMappings(items => [...items, { number: String(items.length + 1), department_ids: [] }]);
  }

  function updateBotMapping(index, patch) {
    setBotMappings(items => items.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  async function saveBotMappings() {
    setAdminError(""); setAdminNotice("");
    try {
      const mappings = botMappings.map(item => ({ reply_number: String(item.number).trim(), department_ids: item.department_ids.map(Number) }));
      const response = await api.put("/api/bot/config", { mappings });
      setAdminNotice(response.data?.message || "Configuração do bot salva com sucesso.");
      await loadAdminData();
    } catch (error) {
      setAdminError(error.response?.data?.message || "Não foi possível salvar a configuração do bot.");
    }
  }

  async function createQuickReply(event) {
    event.preventDefault(); setAdminError(""); setAdminNotice("");
    try {
      await api.post("/api/bot/quick-replies", { title: newQuickReplyTitle.trim(), body: newQuickReplyBody.trim() });
      setNewQuickReplyTitle(""); setNewQuickReplyBody("");
      setAdminNotice("Mensagem pronta cadastrada.");
      const response = await api.get("/api/bot/quick-replies"); setQuickReplies(response.data || []);
    } catch (error) { setAdminError(error.response?.data?.message || "Não foi possível cadastrar a mensagem pronta."); }
  }

  async function deleteQuickReply(item) {
    if (!window.confirm(`Remover a mensagem pronta “${item.title}”?`)) return;
    try {
      await api.delete(`/api/bot/quick-replies/${item.id}`);
      setQuickReplies(items => items.filter(reply => reply.id !== item.id));
      setAdminNotice("Mensagem pronta removida.");
    } catch (error) { setAdminError(error.response?.data?.message || "Não foi possível remover a mensagem pronta."); }
  }

  async function loadQuickReplies() {
    try { const response = await api.get("/api/bot/quick-replies"); setQuickReplies(response.data || []); }
    catch (error) { console.error("Erro ao carregar mensagens prontas:", error); }
  }

  function chooseQuickReply(reply) {
    setText(reply.body);
    setQuickReplyOpen(false);
    setTimeout(() => composerTextRef.current?.focus(), 0);
  }

  function handleLogout() {
    localStorage.removeItem("melo_token");
    localStorage.removeItem("melo_user");

    delete api.defaults.headers.common.Authorization;

    setToken("");
    setUser(null);
    setSelectedConversation(null);
    setMessages([]);
    setActiveTab("conversations");
    setSelectedGroup(null);
    setGroupMessages([]);
  }

  async function loadWhatsappContacts() {
    setContactsLoading(true);
    setContactsError("");
    try {
      const response = await api.get("/api/whatsapp/contacts");
      const contacts = Array.isArray(response.data?.contacts)
        ? response.data.contacts
        : [];
      setWhatsappContacts(contacts);
    } catch (error) {
      console.error("Erro ao carregar contatos do WhatsApp:", error);
      setContactsError(
        error.response?.data?.message ||
          "Não foi possível carregar os contatos do WhatsApp. Você ainda pode iniciar pelo número."
      );
    } finally {
      setContactsLoading(false);
    }
  }

  function openNewConversation() {
    setNewConversationOpen(true);
    setContactSearch("");
    setManualPhone("");
    setManualContactName("");
    loadWhatsappContacts();
  }

  async function startNewConversation(phoneValue, nameValue = "") {
    const phone = String(phoneValue || "").replace(/\D/g, "");
    if (phone.length < 10 || phone.length > 15) {
      alert("Informe um número válido com DDI e DDD. Exemplo: 5521999999999.");
      return;
    }

    setNewConversationLoading(true);
    try {
      const response = await api.post("/api/whatsapp/new-conversation", {
        phone,
        name: String(nameValue || "").trim(),
      });
      const conversationId = response.data?.conversation_id;

      setNewConversationOpen(false);
      setContactSearch("");
      setManualPhone("");
      setManualContactName("");
      setActiveTab("conversations");
      setSelectedGroup(null);
      setGroupMessages([]);
      await loadConversations("open");

      if (conversationId) {
        await openConversation(conversationId);
      } else {
        alert("A conversa foi criada, mas não foi possível abrir automaticamente.");
      }
    } catch (error) {
      console.error("Erro ao iniciar nova conversa:", error);
      alert(
        error.response?.data?.message ||
          "Não foi possível iniciar a conversa. Confira o número e a conexão do WhatsApp."
      );
    } finally {
      setNewConversationLoading(false);
    }
  }

  async function loadConversations(status = "open") {
    try {
      const response = await api.get(
        `/api/conversations?status=${encodeURIComponent(status)}`
      );

      setConversations(response.data);

      return response.data;
    } catch (error) {
      console.error(
        "Erro ao carregar conversas:",
        error
      );

      if (error.response?.status === 401) {
        handleLogout();
      }

      return [];
    } finally {
      setLoading(false);
    }
  }

  async function loadGroups() {
    try {
      const response = await api.get("/api/groups");
      setGroups(response.data);
      return response.data;
    } catch (error) {
      console.error("Erro ao carregar grupos:", error);

      if (error.response?.status === 401) {
        handleLogout();
      }

      return [];
    }
  }

  async function loadProfilePictures(values) {
    const now = Date.now();
    const requested = [...new Set(values.map(profilePictureKey).filter(Boolean))]
      .filter((key) => {
        const lastRequest = profilePictureRequestsRef.current.get(key) || 0;
        if (now - lastRequest < 10 * 60 * 1000) return false;
        profilePictureRequestsRef.current.set(key, now);
        return true;
      });

    if (!requested.length) return;

    try {
      // Lotes pequenos reduzem picos de chamadas à Evolution API.
      for (let offset = 0; offset < requested.length; offset += 5) {
        const batch = requested.slice(offset, offset + 5);
        const response = await api.post("/api/whatsapp/profile-pictures", {
          numbers: batch,
        });
        const pictures = response.data?.pictures || {};
        setProfilePictures((current) => ({ ...current, ...pictures }));
        if (offset + 5 < requested.length) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }
    } catch (error) {
      console.warn("Não foi possível carregar as fotos de perfil:", error.response?.data || error.message);
    }
  }

  async function refreshProfilePicture(value, event) {
    const image = event.currentTarget;
    if (image.dataset.refreshAttempted === "1") {
      image.style.display = "none";
      return;
    }
    image.dataset.refreshAttempted = "1";
    const key = profilePictureKey(value);
    try {
      const response = await api.post("/api/whatsapp/profile-pictures", {
        numbers: [key],
        refresh: true,
      });
      const refreshedUrl = response.data?.pictures?.[key];
      if (refreshedUrl && refreshedUrl !== image.src) {
        image.style.display = "";
        setProfilePictures((current) => ({ ...current, [key]: refreshedUrl }));
      } else {
        image.style.display = "none";
      }
    } catch {
      image.style.display = "none";
    }
  }

  async function openGroup(id) {
    try {
      const response = await api.get(`/api/groups/${id}`);

      setSelectedConversation(null);
      setMessages([]);
      setSelectedGroup(response.data.group);
      setGroupMessages(response.data.messages);
      setActiveTab("groups");
    } catch (error) {
      console.error("Erro ao carregar grupo:", error);
    }
  }

  useEffect(() => {
    if (selectedGroup && groupMessagesRef.current) {
      requestAnimationFrame(() => {
        groupMessagesRef.current.scrollTop =
          groupMessagesRef.current.scrollHeight;
      });
    }
  }, [selectedGroup?.id]);

  useEffect(() => {
    if (selectedConversation && conversationMessagesRef.current) {
      requestAnimationFrame(() => {
        conversationMessagesRef.current.scrollTop =
          conversationMessagesRef.current.scrollHeight;
      });
    }
  }, [selectedConversation?.id]);

  async function refreshCurrentGroup() {
    if (!selectedGroup) {
      return;
    }

    try {
      const response = await api.get(
        `/api/groups/${selectedGroup.id}`
      );

      setSelectedGroup(response.data.group);
      setGroupMessages(response.data.messages);
    } catch (error) {
      console.error("Erro ao atualizar grupo:", error);
    }
  }

  async function openConversation(id) {
    try {
      const response = await api.get(
        `/api/conversations/${id}`
      );

      setSelectedConversation(
        response.data.conversation
      );
      setContactForm({
        name: response.data.conversation.customer_name || "",
        phone: response.data.conversation.customer_phone || "",
        email: response.data.conversation.customer_email || "",
        notes: response.data.conversation.customer_notes || ""
      });
      setContactEditing(false);
      setMessages(response.data.messages);
    } catch (error) {
      console.error(
        "Erro ao carregar conversa:",
        error
      );
    }
  }

  async function refreshCurrentConversation() {
    if (!selectedConversation) {
      return;
    }

    try {
      const response = await api.get(
        `/api/conversations/${selectedConversation.id}`
      );

      setSelectedConversation(
        response.data.conversation
      );
      if (!contactEditing) setContactForm({
        name: response.data.conversation.customer_name || "",
        phone: response.data.conversation.customer_phone || "",
        email: response.data.conversation.customer_email || "",
        notes: response.data.conversation.customer_notes || ""
      });
      setMessages(response.data.messages);
    } catch (error) {
      console.error(
        "Erro ao atualizar conversa:",
        error
      );
    }
  }


  async function saveContact() {
    if (!selectedConversation) return;
    setContactSaving(true);
    try {
      const response = await api.patch(`/api/conversations/${selectedConversation.id}/contact`, contactForm);
      setSelectedConversation(prev => ({ ...prev, ...response.data.conversation }));
      setContactForm({
        name: response.data.conversation.customer_name || "",
        phone: response.data.conversation.customer_phone || "",
        email: response.data.conversation.customer_email || "",
        notes: response.data.conversation.customer_notes || ""
      });
      setContactEditing(false);
      await loadConversations(activeTab === "closed" ? "closed" : "open");
      setProfileNotice("Contato atualizado.");
      setTimeout(() => setProfileNotice(""), 2500);
    } catch (error) {
      alert(error.response?.data?.message || "Não foi possível atualizar o contato.");
    } finally {
      setContactSaving(false);
    }
  }

  async function sendMediaFile(file) {
    if (!file || mediaSending) {
      return;
    }

    if (!selectedConversation && !selectedGroup) {
      return;
    }

    const maxSize = 60 * 1024 * 1024;

    if (file.size > maxSize) {
      alert("O arquivo é muito grande. Limite: 60 MB.");
      return;
    }

    const allowed =
      file.type.startsWith("image/") ||
      file.type.startsWith("video/") ||
      file.type.startsWith("audio/") ||
      file.type === "application/pdf" ||
      file.type.includes("document") ||
      file.type === "text/plain";

    if (!allowed) {
      alert("Tipo de arquivo não suportado.");
      return;
    }

    setMediaSending(true);

    try {
      const mediaDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const payload = {
        targetType: selectedGroup ? "group" : "conversation",
        targetId: selectedGroup
          ? selectedGroup.id
          : selectedConversation.id,
        fileName: file.name,
        mimetype: file.type || "application/octet-stream",
        media: mediaDataUrl,
        caption: text.trim(),
      };

      const mediaEndpoint = selectedGroup
        ? "/api/groups/media/send"
        : "/api/messages/media/send";

      await api.post(
        mediaEndpoint,
        selectedGroup ? JSON.stringify(payload) : payload,
        {
          headers: selectedGroup
            ? { "Content-Type": "application/octet-stream" }
            : { "Content-Type": "application/json" },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      setText("");

      if (selectedGroup) {
        await refreshCurrentGroup();
        await loadGroups();
      } else {
        await refreshCurrentConversation();
        await loadConversations();
      }
    } catch (error) {
      console.error("Erro ao enviar mídia:", error);

      alert(
        error.response?.data?.error ||
          "Não foi possível enviar a mídia."
      );
    } finally {
      setMediaSending(false);

      if (mediaInputRef.current) {
        mediaInputRef.current.value = "";
      }
    }
  }

  function handleMediaSelected(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    sendMediaFile(file);
  }

  async function finalizeConversation() {
    if (!selectedConversation) return;
    const confirmed = window.confirm("Deseja finalizar este atendimento? A conversa será mantida no histórico.");
    if (!confirmed) return;
    try {
      await api.patch(`/api/conversations/${selectedConversation.id}/close`);
      await loadConversations();
      setSelectedConversation(null);
      setMessages([]);
      alert("Atendimento finalizado. A conversa permanece no histórico.");
    } catch (error) {
      alert(error.response?.data?.message || "Não foi possível finalizar o atendimento.");
    }
  }

  async function sendMessage() {
    if (!text.trim()) {
      return;
    }

    const messageToSend = text.trim();

    try {
      if (selectedGroup) {
        await api.post(
          `/api/groups/${selectedGroup.id}/send`,
          {
            message: messageToSend,
          }
        );

        setText("");

        await refreshCurrentGroup();
        await loadGroups();
        return;
      }

      if (!selectedConversation) {
        return;
      }

      await api.post(
        "/api/messages/send",
        {
          phone:
            selectedConversation.customer_phone,

          message: messageToSend,

          conversation_id:
            selectedConversation.id,
        }
      );

      setText("");

      await refreshCurrentConversation();
      await loadConversations();
    } catch (error) {
      console.error(
        "Erro ao enviar mensagem:",
        error
      );

      alert(
        error.response?.data?.error ||
          "NÃ£o foi possÃ­vel enviar a mensagem."
      );
    }
  }

  const emojiOptions = [
    ["😀", "feliz sorrindo"], ["😃", "feliz"], ["😄", "sorriso"], ["😁", "sorriso olhos"], ["😆", "rindo"], ["😅", "suor"], ["😂", "chorando rir"], ["🤣", "rolando rir"], ["😊", "fofo"], ["🙂", "sorriso leve"], ["😉", "piscadinha"], ["😍", "apaixonado"], ["🥰", "carinho"], ["😘", "beijo"], ["😎", "óculos"], ["🤔", "pensando"], ["🙄", "revirando olhos"], ["😢", "triste"], ["😭", "chorando"], ["😡", "raiva"], ["🤗", "abraço"], ["🙏", "oração obrigado"], ["👏", "palmas"], ["👍", "positivo gostei"], ["👎", "negativo"], ["👌", "ok"], ["🤝", "acordo parceria"], ["💪", "força"], ["❤️", "coração amor"], ["🧡", "coração laranja"], ["💛", "coração amarelo"], ["💚", "coração verde"], ["💙", "coração azul"], ["💜", "coração roxo"], ["💔", "coração partido"], ["💯", "cem perfeito"], ["✨", "brilho"], ["🎉", "comemoração"], ["🎊", "confete"], ["🔥", "fogo incrível"], ["⭐", "estrela"], ["✅", "certo concluído"], ["☑️", "marcado"], ["❌", "erro não"], ["⚠️", "atenção alerta"], ["❗", "importante"], ["❓", "pergunta"], ["📌", "fixado"], ["📎", "anexo"], ["📅", "agenda data"], ["🕐", "horário"], ["📞", "telefone"], ["📧", "email"], ["💬", "mensagem"], ["📣", "aviso"], ["🎯", "objetivo"], ["🚀", "vamos"], ["☕", "café"], ["🍀", "sorte"], ["🤩", "animado"], ["😴", "sono"], ["🤦", "facepalm"], ["🤷", "não sei"]
  ];

  const filteredEmojis = emojiOptions.filter(([emoji, description]) =>
    `${emoji} ${description}`.toLowerCase().includes(emojiSearch.trim().toLowerCase())
  );

  function insertEmoji(emoji) {
    const input = composerTextRef.current;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? text.length;
    const nextText = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    setText(nextText);
    setEmojiOpen(false);
    setEmojiSearch("");
    requestAnimationFrame(() => {
      if (input) {
        input.focus();
        const cursor = start + emoji.length;
        input.setSelectionRange(cursor, cursor);
      }
    });
  }

  function renderEmojiPicker() {
    return emojiOpen ? (
      <div
        style={{
          position: "absolute",
          bottom: "52px",
          left: "8px",
          width: "min(320px, calc(100vw - 40px))",
          padding: "12px",
          border: "1px solid #dbe2e8",
          borderRadius: "12px",
          background: "#ffffff",
          boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
          zIndex: 50,
          color: "#24313b",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={emojiSearch}
          onChange={(event) => setEmojiSearch(event.target.value)}
          placeholder="Buscar emoji..."
          aria-label="Buscar emoji"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "9px 10px",
            border: "1px solid #d7dee5",
            borderRadius: "8px",
            outline: "none",
            marginBottom: "8px",
            fontSize: "13px",
          }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
            gap: "4px",
            maxHeight: "220px",
            overflowY: "auto",
          }}
        >
          {filteredEmojis.map(([emoji, description]) => (
            <button
              key={`${emoji}-${description}`}
              type="button"
              title={description}
              aria-label={description}
              onClick={() => insertEmoji(emoji)}
              style={{
                border: 0,
                borderRadius: "7px",
                background: "transparent",
                cursor: "pointer",
                fontSize: "23px",
                lineHeight: 1.4,
                padding: "3px",
              }}
            >
              {emoji}
            </button>
          ))}
          {filteredEmojis.length === 0 && (
            <span style={{ gridColumn: "1 / -1", padding: "12px 4px", fontSize: "12px", color: "#667781" }}>
              Nenhum emoji encontrado.
            </span>
          )}
        </div>
      </div>
    ) : null;
  }

  function handleKeyDown(event) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      sendMessage();
    }
  }

  useEffect(() => {
    if (!token) {
      return;
    }

    async function initialize() {
      const data = await loadConversations();
      await loadGroups();

      if (
        data.length > 0 &&
        !selectedConversation &&
        !selectedGroup
      ) {
        await openConversation(data[0].id);
      }
    }

    initialize();
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const interval = setInterval(async () => {
      const data = await loadConversations(activeTab === "closed" ? "closed" : "open");

      if (selectedConversation) {
        const exists = data.some(
          (conversation) =>
            conversation.id ===
            selectedConversation.id
        );

        if (exists) {
          await refreshCurrentConversation();
        }
      }

      if (selectedGroup) {
        await refreshCurrentGroup();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [token, selectedConversation, selectedGroup, activeTab]);

  // Sincronize a lista de grupos separadamente: a rota de grupos também consulta a Evolution API.
  // Fazer isso a cada 3 segundos pode provocar rate-overlimit e afetar as fotos de perfil.
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      void loadGroups();
    }, 60000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const identifiers = [
      ...conversations.map((conversation) => conversation.customer_phone),
      ...groups.map((group) => group.whatsapp_jid),
    ];
    void loadProfilePictures(identifiers);
  }, [token, conversations, groups]);

  const filteredConversations =
    conversations.filter((conversation) => {
      const term =
        search.trim().toLowerCase();

      if (!term) {
        return true;
      }

      return (
        String(
          conversation.customer_name || ""
        )
          .toLowerCase()
          .includes(term) ||
        String(
          conversation.customer_phone || ""
        )
          .toLowerCase()
          .includes(term) ||
        String(
          conversation.last_message || ""
        )
          .toLowerCase()
          .includes(term)
      );
    });

  const filteredGroups =
    groups.filter((group) => {
      const term =
        search.trim().toLowerCase();

      if (!term) {
        return true;
      }

      return (
        String(group.name || "")
          .toLowerCase()
          .includes(term) ||
        String(group.last_message || "")
          .toLowerCase()
          .includes(term)
      );
    });

  if (!token || !user) {
    return (
      <div className="login-page">

        <section className="login-left">

          <div className="login-left-inner">

            <div className="login-system-mark">
              <MessageCircle size={28} />
            </div>

            <div className="login-eyebrow">
              MELO & MELO ASSOCIADOS
            </div>

            <div className="login-heading">
              <h1>Atendimento</h1>

              <p>
                Atendimento | Melo & Melo
              </p>
            </div>

            <form
              className="login-form"
              onSubmit={handleLogin}
            >

              <div className="login-field">

                <label>E-mail</label>

                <div className="login-input">

                  <Mail size={18} />

                  <input
                    type="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    placeholder="seu@email.com"
                    autoComplete="username"
                    required
                  />

                </div>

              </div>

              <div className="login-field">

                <label>Senha</label>

                <div className="login-input">

                  <Lock size={18} />

                  <input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    value={password}
                    onChange={(event) =>
                      setPassword(
                        event.target.value
                      )
                    }
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                    required
                  />

                  <button
                    type="button"
                    className="login-eye"
                    onClick={() =>
                      setShowPassword(
                        (value) => !value
                      )
                    }
                    aria-label={
                      showPassword
                        ? "Ocultar senha"
                        : "Mostrar senha"
                    }
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>

                </div>

              </div>

              {loginError && (
                <div className="login-error">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                className="login-submit"
                disabled={loginLoading}
              >

                <span>
                  {loginLoading
                    ? "Entrando..."
                    : "Entrar"}
                </span>

                {!loginLoading && (
                  <ArrowRight size={19} />
                )}

              </button>

            </form>

            <div className="login-security">
              Acesso restrito aos usuÃ¡rios
              autorizados da Melo & Melo Associados.
            </div>

          </div>

        </section>

        <section className="login-right">

          <img
            src="/logo-melo-melo.png"
            alt="Melo & Melo Associados"
            className="company-logo"
          />

          <div className="login-right-content">

            <div>
              Conectando pessoas,
            </div>

            <strong>
              solucionando demandas.
            </strong>

          </div>

        </section>

      </div>
    );
  }

  return (
    <div
      className={`app ${darkMode ? "theme-dark" : "theme-light"}`}
      style={{
        "--app-chat-background": themeColors.background,
        "--app-bubble": themeColors.bubble,
        "--app-message-text": themeColors.text || (darkMode ? "#f2f6fa" : "#1b2d3d"),
        "--app-panel-background": darkMode ? "#202833" : "#ffffff"
      }}
    >

      <aside className="sidebar">

        <div className="brand">

          <img
            src="/logo-melo-melo.png"
            alt="Melo & Melo"
            className="sidebar-logo"
          />

          <div>
            <strong className="brand-title">
              <span>Atendimento</span>
              <span>Melo &amp; Melo</span>
            </strong>

            <span>
              Central de atendimento
            </span>
          </div>

        </div>

        <div className="appearance-controls">
          <button type="button" onClick={() => {
            const next = !darkMode;
            setDarkMode(next);
            localStorage.setItem("melo_theme_mode", next ? "dark" : "light");
          }} title={darkMode ? "Usar modo claro" : "Usar modo escuro"}>
            {darkMode ? "☀️ Modo claro" : "🌙 Modo escuro"}
          </button>
          <button type="button" onClick={() => setShowAppearance(v => !v)} title="Personalizar cores">
            🎨 Cores
          </button>
        </div>
        {showAppearance && (
          <div className="appearance-panel">
            <strong>Personalizar cores</strong>
            <label>Fundo da conversa <input type="color" value={themeColors.background} onChange={e => {
              const next = { ...themeColors, background: e.target.value }; setThemeColors(next); localStorage.setItem("melo_theme_colors", JSON.stringify(next));
            }} /></label>
            <label>Balões das mensagens <input type="color" value={themeColors.bubble} onChange={e => {
              const next = { ...themeColors, bubble: e.target.value }; setThemeColors(next); localStorage.setItem("melo_theme_colors", JSON.stringify(next));
            }} /></label>
            <label>Cor das letras <input type="color" value={themeColors.text || (darkMode ? "#f2f6fa" : "#1b2d3d")} onChange={e => {
              const next = { ...themeColors, text: e.target.value }; setThemeColors(next); localStorage.setItem("melo_theme_colors", JSON.stringify(next));
            }} /></label>
            <button type="button" onClick={() => {
              const next = { background: darkMode ? "#202833" : "#eaf0f5", bubble: darkMode ? "#2b3541" : "#d9fdd3", text: darkMode ? "#f2f6fa" : "#1b2d3d" };
              setThemeColors(next); localStorage.setItem("melo_theme_colors", JSON.stringify(next));
            }}>Restaurar cores padrão</button>
          </div>
        )}

        <div className="search">
          <Search size={18} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder={
              activeTab === "groups"
                ? "Pesquisar grupo..."
                : "Pesquisar conversa..."
            }
          />
        </div>

        {activeTab !== "admin" && (
          <button
            type="button"
            onClick={openNewConversation}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              width: "calc(100% - 24px)",
              margin: "10px 12px 2px",
              padding: "10px 12px",
              border: "1px solid rgba(255,255,255,0.22)",
              borderRadius: "9px",
              background: "#16a085",
              color: "#ffffff",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            <Plus size={17} />
            Nova conversa
          </button>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "10px 12px 8px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <button
            onClick={() => {
              setActiveTab("conversations");
              setSelectedGroup(null);
              setGroupMessages([]);
              setSelectedConversation(null);
              setMessages([]);
              setSearch("");
              loadConversations("open");
            }}
            style={{
              flex: 1,
              border: 0,
              background:
                activeTab === "conversations"
                  ? "rgba(255,255,255,0.12)"
                  : "transparent",
              color: "inherit",
              cursor: "pointer",
              padding: "9px 8px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight:
                activeTab === "conversations" ? 700 : 500,
              opacity:
                activeTab === "conversations" ? 1 : 0.65,
            }}
          >
            CONVERSAS
          </button>

          <button
            onClick={() => {
              setActiveTab("groups");
              setSelectedConversation(null);
              setMessages([]);
              setSearch("");
              if (groups.length > 0 && !selectedGroup) {
                openGroup(groups[0].id);
              }
            }}
            style={{
              flex: 1,
              border: 0,
              background:
                activeTab === "groups"
                  ? "rgba(255,255,255,0.12)"
                  : "transparent",
              color: "inherit",
              cursor: "pointer",
              padding: "9px 8px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight:
                activeTab === "groups" ? 700 : 500,
              opacity:
                activeTab === "groups" ? 1 : 0.65,
            }}
          >
            GRUPOS
          </button>

          <button
            onClick={() => {
              setActiveTab("closed");
              setSelectedGroup(null);
              setGroupMessages([]);
              setSelectedConversation(null);
              setMessages([]);
              setSearch("");
              loadConversations("closed");
            }}
            style={{
              flex: 1,
              border: 0,
              background: activeTab === "closed" ? "rgba(255,255,255,0.12)" : "transparent",
              color: "inherit",
              cursor: "pointer",
              padding: "9px 6px",
              borderRadius: "8px",
              fontSize: "10px",
              fontWeight: activeTab === "closed" ? 700 : 500,
              opacity: activeTab === "closed" ? 1 : 0.75,
            }}
            title="Consultar atendimentos finalizados do seu departamento"
          >
            FINALIZADAS
          </button>

          {user?.role === "admin" && (
            <button
              onClick={() => {
                setActiveTab("admin");
                setAdminView("users");
                setSearch("");
              }}
              style={{
                flex: 1,
                border: 0,
                background: activeTab === "admin" ? "rgba(255,255,255,0.12)" : "transparent",
                color: "inherit",
                cursor: "pointer",
                padding: "9px 8px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: activeTab === "admin" ? 700 : 500,
                opacity: activeTab === "admin" ? 1 : 0.75,
              }}
              title="Administrar usuários e departamentos"
            >
              ADMIN
            </button>
          )}
        </div>

        <div className="conversation-title">
          {activeTab === "groups" ? "Grupos" : activeTab === "closed" ? "Atendimentos finalizados" : activeTab === "admin" ? "Administração" : "Conversas"}
        </div>

        <div className="conversation-list">
          {activeTab === "conversations" || activeTab === "closed" ? (
            <>
              {loading && (
                <div className="empty">
                  Carregando...
                </div>
              )}

              {!loading &&
                filteredConversations.length === 0 && (
                  <div className="empty">
                    Nenhuma conversa encontrada
                  </div>
                )}

              {filteredConversations.map(
                (conversation) => (
                  <button
                    key={conversation.id}
                    className={
                      selectedConversation?.id ===
                      conversation.id
                        ? "conversation active"
                        : "conversation"
                    }
                    onClick={() => {
                      setActiveTab(activeTab === "closed" ? "closed" : "conversations");
                      setSelectedGroup(null);
                      setGroupMessages([]);
                      openConversation(
                        conversation.id
                      );
                    }}
                  >
                    <div className="avatar" style={{ position: "relative", overflow: "hidden" }}>
                      <User size={20} />
                      {profilePictures[profilePictureKey(conversation.customer_phone)] && (
                        <img
                          src={profilePictures[profilePictureKey(conversation.customer_phone)]}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(event) => { void refreshProfilePicture(conversation.customer_phone, event); }}
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                        />
                      )}
                    </div>

                    <div className="conversation-info">
                      <div className="conversation-top">
                        <strong>
                          {conversation.customer_name ||
                            conversation.customer_phone}
                        </strong>

                        <span>
                          {formatConversationDate(
                            conversation.last_message_at ||
                              conversation.started_at
                          )}
                        </span>
                        {activeTab !== "closed" && Number(conversation.unread_count || 0) > 0 && (
                          <span className="unread-badge" title={`${conversation.unread_count} mensagem(ns) não lida(s)`}>
                            {conversation.unread_count > 99 ? "99+" : conversation.unread_count}
                          </span>
                        )}
                      </div>
                      <p>
                        {conversation.last_message ||
                          "Sem mensagens"}
                      </p>
                    </div>
                  </button>
                )
              )}
            </>
          ) : (
            <>
              {filteredGroups.length === 0 && (
                <div className="empty">
                  Nenhum grupo encontrado
                </div>
              )}

              {filteredGroups.map((group) => (
                <button
                  key={group.id}
                  className={
                    selectedGroup?.id === group.id
                      ? "conversation active"
                      : "conversation"
                  }
                  onClick={() => openGroup(group.id)}
                >
                  <div
                    className="avatar"
                    style={{
                      background: "rgba(255,255,255,0.12)",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <Users size={20} />
                    {profilePictures[profilePictureKey(group.whatsapp_jid)] && (
                      <img
                        src={profilePictures[profilePictureKey(group.whatsapp_jid)]}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(event) => { void refreshProfilePicture(group.whatsapp_jid, event); }}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                      />
                    )}
                  </div>

                  <div className="conversation-info">
                    <div className="conversation-top">
                      <strong>
                        {group.name ||
                          group.whatsapp_jid}
                      </strong>

                      <span>
                        {formatConversationDate(
                          group.last_message_at ||
                            group.updated_at
                        )}
                      </span>
                      {Number(group.unread_count || 0) > 0 && (
                        <span className="unread-badge">{group.unread_count > 99 ? "99+" : group.unread_count}</span>
                      )}
                    </div>

                    <p>
                      {group.last_message
                        ? group.last_message_participant
                          ? `${group.last_message_participant}: ${group.last_message}`
                          : group.last_message
                        : "Sem mensagens"}
                    </p>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>

        <div
          className="sidebar-user"
          style={{
            marginTop: "auto",
            padding: "16px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
            }}
          >

            <div
              style={{
                minWidth: 0,
              }}
            >

              <strong
                style={{
                  display: "block",
                  fontSize: "13px",
                }}
              >
                {user.name}
              </strong>

              <span
                style={{
                  display: "block",
                  fontSize: "11px",
                  opacity: 0.65,
                  marginTop: "3px",
                }}
              >
                {user.role}
              </span>

            </div>

            <button
              onClick={handleLogout}
              title="Sair"
              style={{
                border: 0,
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                padding: "6px",
              }}
            >
              Sair
            </button>

          </div>

        </div>

      </aside>

      <main className="chat">

        {!selectedConversation && !selectedGroup ? (
          <div className="welcome">
            <MessageCircle size={56} />

            <h2>
              Sistema de Atendimento
            </h2>

            <p>
              Selecione uma conversa ou grupo para começar.
            </p>
          </div>
        ) : selectedGroup ? (
          <>
            <header className="chat-header">
              <div className="customer-header">
                <div className="avatar large" style={{ position: "relative", overflow: "hidden" }}>
                  <Users size={24} />
                  {profilePictures[profilePictureKey(selectedGroup.whatsapp_jid)] && (
                    <img
                      src={profilePictures[profilePictureKey(selectedGroup.whatsapp_jid)]}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={(event) => { void refreshProfilePicture(selectedGroup.whatsapp_jid, event); }}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                    />
                  )}
                </div>

                <div>
                  <strong>
                    {selectedGroup.name ||
                      selectedGroup.whatsapp_jid}
                  </strong>

                  <span>
                    Grupo WhatsApp
                  </span>
                </div>
              </div>

              <div className="header-actions">
                <button>
                  <MoreVertical size={20} />
                </button>
              </div>
            </header>

            <div style={{ padding: "12px 20px", borderBottom: "1px solid #e7edf2", background: "#fff", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ fontSize: "12px", color: "#657887", fontWeight: 700 }}>DEPARTAMENTO</div>
              {user?.role === "admin" ? (
                <select
                  value={selectedGroup.department_id ? String(selectedGroup.department_id) : ""}
                  onChange={(event) => assignGroupDepartment(event.target.value)}
                  disabled={departmentSaving}
                  aria-label="Vincular grupo a um departamento"
                  style={{ minWidth: "220px", padding: "8px 10px", border: "1px solid #d6e0e8", borderRadius: "8px", background: "#fff", color: "#233746", fontSize: "13px" }}
                >
                  <option value="">Sem departamento</option>
                  {availableDepartments.filter((department) => department.active || String(department.id) === String(selectedGroup.department_id)).map((department) => (
                    <option key={department.id} value={String(department.id)}>{department.name}</option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize: "13px", color: "#233746" }}>{selectedGroup.department_name || "Não definido"}</span>
              )}
              {departmentSaving && <span style={{ fontSize: "12px", color: "#657887" }}>Salvando...</span>}
              {profileNotice && <span role="status" style={{ fontSize: "12px", color: profileNotice.includes("sucesso") ? "#16804a" : "#b42318" }}>{profileNotice}</span>}
            </div>

            <section className="messages" ref={groupMessagesRef}>
              {groupMessages.map((message, index) => {
                const previousMessage =
                  index > 0
                    ? groupMessages[index - 1]
                    : null;

                const showDateSeparator =
                  !previousMessage ||
                  !isSameCalendarDay(
                    previousMessage.sent_at,
                    message.sent_at
                  );

                return (
                  <div key={message.id}>
                    {showDateSeparator && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          margin: "14px 0",
                        }}
                      >
                        <span
                          style={{
                            background: "#e7edf2",
                            color: "#667781",
                            padding: "6px 12px",
                            borderRadius: "8px",
                            fontSize: "11px",
                            fontWeight: 600,
                            boxShadow:
                              "0 1px 1px rgba(0,0,0,0.05)",
                          }}
                        >
                          {formatMessageDate(
                            message.sent_at
                          )}
                        </span>
                      </div>
                    )}

                    <div
                      className={
                        message.direction ===
                        "outgoing"
                          ? "message-row outgoing"
                          : "message-row incoming"
                      }
                    >
                      <div className="message">
                        {message.direction !==
                          "outgoing" &&
                          message.participant_name && (
                            <div
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                marginBottom: "4px",
                                opacity: 0.75,
                              }}
                            >
                              {message.participant_name}
                            </div>
                          )}

                        {normalizeMediaType(message.message_type) ? (
                          <>
                            <MediaMessage message={message} />
                            {message.content &&
                              !String(message.content).startsWith("[") && (
                              <div
                                style={{
                                  marginTop: "7px",
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {renderMessageText(message.content)}
                              </div>
                            )}
                          </>
                        ) : (
                          message.content && (
                            <div style={{ whiteSpace: "pre-wrap" }}>
                              {renderMessageText(message.content)}
                            </div>
                          )
                        )}

                        <div className="message-meta">
                          <span>
                            {new Date(
                              message.sent_at
                            ).toLocaleTimeString(
                              "pt-BR",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )}
                          </span>

                          {message.direction ===
                            "outgoing" && (
                            <CheckCheck size={15} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {groupMessages.length === 0 && (
                <div className="empty">
                  Nenhuma mensagem registrada neste grupo.
                </div>
              )}
            </section>

            <footer className="composer" style={{ position: "relative" }}>
              {renderEmojiPicker()}
              <button
                type="button"
                onClick={() => {
                  setEmojiOpen((open) => !open);
                  setEmojiSearch("");
                }}
                title="Inserir emoji"
                aria-label="Inserir emoji"
                style={{
                  border: 0,
                  background: emojiOpen ? "rgba(37, 211, 102, 0.14)" : "transparent",
                  color: "#667781",
                  cursor: "pointer",
                  padding: "8px",
                  borderRadius: "8px",
                }}
              >
                <Smile size={21} />
              </button>
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*,video/*,audio/*,application/pdf,text/plain,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                style={{ display: "none" }}
                onChange={handleMediaSelected}
              />

              <button
                type="button"
                onClick={() => mediaInputRef.current?.click()}
                disabled={mediaSending}
                title="Enviar foto, vídeo, áudio ou documento"
                style={{
                  border: 0,
                  background: "transparent",
                  color: "#667781",
                  cursor: mediaSending ? "default" : "pointer",
                  padding: "8px",
                  opacity: mediaSending ? 0.5 : 1,
                }}
              >
                <Paperclip size={20} />
              </button>
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => { setQuickReplyOpen(open => !open); loadQuickReplies(); }}
                  title="Mensagens prontas"
                  aria-label="Mensagens prontas"
                  style={{ border: 0, background: quickReplyOpen ? "rgba(37,211,102,0.14)" : "transparent", color: "#667781", cursor: "pointer", padding: "8px", borderRadius: "8px" }}
                ><Zap size={20} /></button>
                {quickReplyOpen && (
                  <div style={{ position: "absolute", bottom: "48px", left: 0, width: "min(340px, 80vw)", maxHeight: "360px", overflowY: "auto", background: "#fff", border: "1px solid #dbe3e9", borderRadius: "12px", boxShadow: "0 10px 35px rgba(0,0,0,.18)", zIndex: 500, padding: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 6px 9px", fontWeight: 700, color: "#203746" }}>Mensagens prontas <button type="button" onClick={() => setQuickReplyOpen(false)} style={{ border: 0, background: "transparent", cursor: "pointer", color: "#667781" }}><X size={16} /></button></div>
                    {quickReplies.length ? quickReplies.map(reply => (
                      <button key={reply.id} type="button" onClick={() => chooseQuickReply(reply)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px", border: "0", borderTop: "1px solid #edf1f4", background: "#fff", cursor: "pointer", borderRadius: "6px", color: "#263d4d" }}>
                        <strong style={{ display: "block", marginBottom: "4px" }}>{reply.title}</strong><span style={{ display: "block", fontSize: "12px", color: "#667781", whiteSpace: "pre-wrap" }}>{reply.body.length > 140 ? reply.body.slice(0, 140) + "…" : reply.body}</span>
                      </button>
                    )) : <div style={{ padding: "12px", color: "#667781", fontSize: "13px" }}>Nenhuma mensagem pronta cadastrada. Cadastre-as em Administração → Bot.</div>}
                  </div>
                )}
              </div>

              <textarea
                ref={composerTextRef}
                value={text}
                onChange={(event) =>
                  setText(event.target.value)
                }
                onKeyDown={handleKeyDown}
                placeholder={
                  mediaSending
                    ? "Enviando mídia..."
                    : "Digite uma mensagem para o grupo..."
                }
                rows={1}
                disabled={mediaSending}
              />

              <button
                className="send"
                onClick={sendMessage}
                disabled={!text.trim() || mediaSending}
                title="Enviar mensagem"
              >
                <Send size={20} />
              </button>
            </footer>
          </>
        ) : (
          <>
            <header className="chat-header">
              <div className="customer-header">
                <div className="avatar large" style={{ position: "relative", overflow: "hidden" }}>
                  <User size={24} />
                  {profilePictures[profilePictureKey(selectedConversation.customer_phone)] && (
                    <img
                      src={profilePictures[profilePictureKey(selectedConversation.customer_phone)]}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={(event) => { void refreshProfilePicture(selectedConversation.customer_phone, event); }}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                    />
                  )}
                </div>

                <div>
                  <strong>
                    {selectedConversation.customer_name ||
                      selectedConversation.customer_phone}
                  </strong>

                  <span>
                    {selectedConversation.customer_phone}
                  </span>
                </div>
              </div>

              <div className="header-actions">
                {selectedConversation.status === "open" && (
                  <button
                    type="button"
                    onClick={finalizeConversation}
                    title="Finalizar atendimento"
                    aria-label="Finalizar atendimento"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 10px",
                      border: "1px solid #d8e2e8",
                      borderRadius: "8px",
                      background: "#ffffff",
                      color: "#245b4b",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    <CheckCircle size={17} />
                    Finalizar atendimento
                  </button>
                )}
                {selectedConversation.status === "closed" && (
                  <span style={{ fontSize: "12px", color: "#667781" }}>Atendimento finalizado</span>
                )}
                <button>
                  <MoreVertical size={20} />
                </button>
              </div>
            </header>

            <section className="messages" ref={conversationMessagesRef}>
              {messages.map((message, index) => {
                const previousMessage =
                  index > 0
                    ? messages[index - 1]
                    : null;

                const showDateSeparator =
                  !previousMessage ||
                  !isSameCalendarDay(
                    previousMessage.sent_at,
                    message.sent_at
                  );

                return (
                  <div key={message.id}>
                    {showDateSeparator && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          margin: "14px 0",
                        }}
                      >
                        <span
                          style={{
                            background: "#e7edf2",
                            color: "#667781",
                            padding: "6px 12px",
                            borderRadius: "8px",
                            fontSize: "11px",
                            fontWeight: 600,
                            boxShadow:
                              "0 1px 1px rgba(0,0,0,0.05)",
                          }}
                        >
                          {formatMessageDate(
                            message.sent_at
                          )}
                        </span>
                      </div>
                    )}

                    <div
                      className={
                        message.direction ===
                        "outgoing"
                          ? "message-row outgoing"
                          : "message-row incoming"
                      }
                    >
                      <div className="message">
                        {normalizeMediaType(message.message_type) ? (
                          <>
                            <MediaMessage message={message} />
                            {message.content &&
                              !String(message.content).startsWith("[") && (
                              <div
                                style={{
                                  marginTop: "7px",
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {renderMessageText(message.content)}
                              </div>
                            )}
                          </>
                        ) : (
                          message.content && (
                            <div style={{ whiteSpace: "pre-wrap" }}>
                              {renderMessageText(message.content)}
                            </div>
                          )
                        )}

                        <div className="message-meta">
                          <span>
                            {new Date(
                              message.sent_at
                            ).toLocaleTimeString(
                              "pt-BR",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )}
                          </span>

                          {message.direction ===
                            "outgoing" && (
                            <CheckCheck size={15} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>

            {selectedConversation.status === "closed" ? (
              <div style={{ padding: "14px 18px", background: "#f7f9fa", borderTop: "1px solid #e4eaee", color: "#667781", fontSize: "13px", textAlign: "center" }}>
                <Archive size={16} style={{ verticalAlign: "middle", marginRight: 7 }} />
                Atendimento finalizado — histórico disponível para consulta.
              </div>
            ) : (
            <footer className="composer" style={{ position: "relative" }}>
              {renderEmojiPicker()}
              <button
                type="button"
                onClick={() => {
                  setEmojiOpen((open) => !open);
                  setEmojiSearch("");
                }}
                title="Inserir emoji"
                aria-label="Inserir emoji"
                style={{
                  border: 0,
                  background: emojiOpen ? "rgba(37, 211, 102, 0.14)" : "transparent",
                  color: "#667781",
                  cursor: "pointer",
                  padding: "8px",
                  borderRadius: "8px",
                }}
              >
                <Smile size={21} />
              </button>
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*,video/*,audio/*,application/pdf,text/plain,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                style={{ display: "none" }}
                onChange={handleMediaSelected}
              />

              <button
                type="button"
                onClick={() => mediaInputRef.current?.click()}
                disabled={mediaSending}
                title="Enviar foto, vídeo, áudio ou documento"
                style={{
                  border: 0,
                  background: "transparent",
                  color: "#667781",
                  cursor: mediaSending ? "default" : "pointer",
                  padding: "8px",
                  opacity: mediaSending ? 0.5 : 1,
                }}
              >
                <Paperclip size={20} />
              </button>
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => { setQuickReplyOpen(open => !open); loadQuickReplies(); }}
                  title="Mensagens prontas"
                  aria-label="Mensagens prontas"
                  style={{ border: 0, background: quickReplyOpen ? "rgba(37,211,102,0.14)" : "transparent", color: "#667781", cursor: "pointer", padding: "8px", borderRadius: "8px" }}
                ><Zap size={20} /></button>
                {quickReplyOpen && (
                  <div style={{ position: "absolute", bottom: "48px", left: 0, width: "min(340px, 80vw)", maxHeight: "360px", overflowY: "auto", background: "#fff", border: "1px solid #dbe3e9", borderRadius: "12px", boxShadow: "0 10px 35px rgba(0,0,0,.18)", zIndex: 500, padding: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 6px 9px", fontWeight: 700, color: "#203746" }}>Mensagens prontas <button type="button" onClick={() => setQuickReplyOpen(false)} style={{ border: 0, background: "transparent", cursor: "pointer", color: "#667781" }}><X size={16} /></button></div>
                    {quickReplies.length ? quickReplies.map(reply => (
                      <button key={reply.id} type="button" onClick={() => chooseQuickReply(reply)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px", border: "0", borderTop: "1px solid #edf1f4", background: "#fff", cursor: "pointer", borderRadius: "6px", color: "#263d4d" }}>
                        <strong style={{ display: "block", marginBottom: "4px" }}>{reply.title}</strong><span style={{ display: "block", fontSize: "12px", color: "#667781", whiteSpace: "pre-wrap" }}>{reply.body.length > 140 ? reply.body.slice(0, 140) + "…" : reply.body}</span>
                      </button>
                    )) : <div style={{ padding: "12px", color: "#667781", fontSize: "13px" }}>Nenhuma mensagem pronta cadastrada. Cadastre-as em Administração → Bot.</div>}
                  </div>
                )}
              </div>

              <textarea
                ref={composerTextRef}
                value={text}
                onChange={(event) =>
                  setText(event.target.value)
                }
                onKeyDown={handleKeyDown}
                placeholder={
                  mediaSending
                    ? "Enviando mídia..."
                    : "Digite uma mensagem..."
                }
                rows={1}
                disabled={mediaSending}
              />

              <button
                className="send"
                onClick={sendMessage}
                disabled={!text.trim() || mediaSending}
              >
                <Send size={20} />
              </button>
            </footer>
            )}
          </>
        )}
      </main>

      {selectedConversation && !selectedGroup && (

        <aside className="customer-panel">

          <div className="customer-panel-header">

            <strong>
              Cliente
            </strong>

            <button type="button" onClick={() => setContactEditing(v => !v)} title={contactEditing ? "Cancelar edição" : "Editar contato"}>
              {contactEditing ? <X size={19} /> : <Pencil size={19} />}
            </button>

          </div>

          <div className="customer-profile">

            <div className="avatar profile">
              <User size={32} />
            </div>

            <h3>
              {selectedConversation.customer_name ||
                "Cliente"}
            </h3>

            <span>
              {selectedConversation.customer_phone}
            </span>

          </div>

          <div className="customer-section">
            <label>Telefone</label>
            {contactEditing ? (
              <input className="contact-edit-input" value={contactForm.phone} onChange={e => setContactForm(v => ({ ...v, phone: e.target.value }))} />
            ) : <p>{selectedConversation.customer_phone}</p>}
          </div>
          <div className="customer-section">
            <label>Nome do contato</label>
            {contactEditing ? (
              <input className="contact-edit-input" value={contactForm.name} onChange={e => setContactForm(v => ({ ...v, name: e.target.value }))} placeholder="Nome do contato" />
            ) : <p>{selectedConversation.customer_name || "Não informado"}</p>}
          </div>
          <div className="customer-section">
            <label>E-mail</label>
            {contactEditing ? (
              <input className="contact-edit-input" type="email" value={contactForm.email} onChange={e => setContactForm(v => ({ ...v, email: e.target.value }))} placeholder="email@empresa.com" />
            ) : <p>{selectedConversation.customer_email || "Não informado"}</p>}
          </div>
          <div className="customer-section">
            <label>Observações internas</label>
            {contactEditing ? (
              <textarea className="contact-edit-input" rows={4} value={contactForm.notes} onChange={e => setContactForm(v => ({ ...v, notes: e.target.value }))} placeholder="Informações importantes sobre o contato" />
            ) : <p>{selectedConversation.customer_notes || "Nenhuma observação cadastrada."}</p>}
          </div>
          {contactEditing && (
            <div className="customer-section contact-edit-actions">
              <button type="button" onClick={saveContact} disabled={contactSaving}>{contactSaving ? "Salvando..." : "Salvar contato"}</button>
              <button type="button" onClick={() => {
                setContactEditing(false);
                setContactForm({ name: selectedConversation.customer_name || "", phone: selectedConversation.customer_phone || "", email: selectedConversation.customer_email || "", notes: selectedConversation.customer_notes || "" });
              }}>Cancelar</button>
            </div>
          )}
          {profileNotice && <div className="customer-section profile-notice">{profileNotice}</div>}

          <div className="customer-section">

            <label>
              Status
            </label>

            <span className="status">
              {selectedConversation.status}
            </span>

          </div>

          <div className="customer-section">

            <label>
              Atendente
            </label>

            <p>
              {selectedConversation.assigned_user_name ||
                "NÃ£o atribuÃ­do"}
            </p>

          </div>

          <div className="customer-section">

            <label>
              Departamento
            </label>

            {user?.role === "admin" ? (
              <select
                value={selectedConversation.department_id ? String(selectedConversation.department_id) : ""}
                onChange={(event) => assignConversationDepartment(event.target.value)}
                disabled={departmentSaving}
                aria-label="Vincular conversa a um departamento"
                style={{ width: "100%", marginTop: "8px", padding: "10px 12px", border: "1px solid #d6e0e8", borderRadius: "9px", background: "#fff", color: "#233746", fontSize: "13px" }}
              >
                <option value="">Sem departamento</option>
                {availableDepartments.filter((department) => department.active || String(department.id) === String(selectedConversation.department_id)).map((department) => (
                  <option key={department.id} value={String(department.id)}>{department.name}</option>
                ))}
              </select>
            ) : (
              <p>
                {selectedConversation.department_name || "Não definido"}
              </p>
            )}
            {departmentSaving && <p style={{ fontSize: "12px", color: "#657887", marginTop: "6px" }}>Salvando departamento...</p>}
            {profileNotice && <p role="status" style={{ fontSize: "12px", color: profileNotice.includes("sucesso") ? "#16804a" : "#b42318", marginTop: "6px" }}>{profileNotice}</p>}

          </div>

        </aside>

      )}

      {activeTab === "admin" && user?.role === "admin" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Administração do sistema"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            overflowY: "auto",
            background: "#f3f6f9",
            color: "#172b3a",
            padding: "clamp(16px, 3vw, 36px)",
            boxSizing: "border-box",
          }}
        >
          <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
            <header style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              gap: "16px", flexWrap: "wrap", marginBottom: "24px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{
                  width: "48px", height: "48px", borderRadius: "14px",
                  background: "#102d46", color: "#fff", display: "grid", placeItems: "center"
                }}>
                  <ShieldCheck size={25} />
                </div>
                <div>
                  <h1 style={{ margin: 0, fontSize: "25px" }}>Administração</h1>
                  <p style={{ margin: "5px 0 0", color: "#657887", fontSize: "13px" }}>
                    Usuários, perfis de acesso e departamentos
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" onClick={loadAdminData} style={adminButtonStyle("secondary")}>
                  <RefreshCw size={16} /> Atualizar
                </button>
                <button type="button" onClick={() => setActiveTab("conversations")} style={adminButtonStyle("primary")}>
                  <X size={17} /> Voltar ao atendimento
                </button>
              </div>
            </header>

            <div style={{ display: "flex", gap: "8px", marginBottom: "18px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => setAdminView("users")} style={adminButtonStyle(adminView === "users" ? "primary" : "secondary")}>
                <Users size={16} /> Usuários
              </button>
              <button type="button" onClick={() => setAdminView("departments")} style={adminButtonStyle(adminView === "departments" ? "primary" : "secondary")}>
                <Building2 size={16} /> Departamentos
              </button>
              <button type="button" onClick={() => setAdminView("groups")} style={adminButtonStyle(adminView === "groups" ? "primary" : "secondary")}>
                <Users size={16} /> Grupos
              </button>
              <button type="button" onClick={() => setAdminView("bot")} style={adminButtonStyle(adminView === "bot" ? "primary" : "secondary")}>
                <Zap size={16} /> Bot
              </button>
            </div>

            {adminError && (
              <div role="alert" style={{ padding: "12px 14px", borderRadius: "10px", background: "#fff0f0", color: "#a52828", marginBottom: "14px" }}>
                {adminError}
              </div>
            )}
            {adminNotice && (
              <div role="status" style={{ padding: "12px 14px", borderRadius: "10px", background: "#e9f8ef", color: "#176b3a", marginBottom: "14px" }}>
                {adminNotice}
              </div>
            )}
            {adminLoading && <p style={{ color: "#657887" }}>Carregando dados administrativos...</p>}

            {adminView === "groups" ? (
              <section style={adminCardStyle}>
                <h2 style={{ margin: "0 0 8px", fontSize: "18px" }}>Vincular grupos a departamentos</h2>
                <p style={{ color: "#657887", fontSize: "13px", lineHeight: 1.5 }}>Selecione um ou mais departamentos para cada grupo. Os colaboradores desses departamentos poderão consultar e responder às mensagens do grupo.</p>
                <div style={{ display: "grid", gap: "14px" }}>
                  {adminGroups.map(group => (
                    <div key={group.id} style={{ border: "1px solid #e0e7ed", borderRadius: "12px", padding: "14px", display: "grid", gap: "10px" }}>
                      <strong>{group.name || group.whatsapp_jid}</strong>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}>
                        {adminDepartments.filter(d => d.active).map(department => {
                          const selected = (groupDepartmentDrafts[String(group.id)] || []).includes(Number(department.id));
                          return <label key={department.id} style={{ display: "flex", alignItems: "center", gap: "8px", border: "1px solid #e4eaf0", borderRadius: "8px", padding: "9px", fontSize: "12px", color: "#294456" }}>
                            <input type="checkbox" checked={selected} onChange={e => setGroupDepartmentDrafts(prev => ({ ...prev, [String(group.id)]: e.target.checked ? [...(prev[String(group.id)] || []), Number(department.id)] : (prev[String(group.id)] || []).filter(id => id !== Number(department.id)) }))} />
                            {department.name}
                          </label>;
                        })}
                      </div>
                      <div><button type="button" onClick={() => saveGroupDepartments(group.id)} style={adminButtonStyle("primary")}><Save size={15} /> Salvar vínculos</button></div>
                    </div>
                  ))}
                  {!adminGroups.length && <p>Nenhum grupo foi sincronizado ainda.</p>}
                </div>
              </section>
            ) : adminView === "bot" ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px", alignItems: "start" }}>
                <section style={adminCardStyle}>
                  <h2 style={{ margin: "0 0 8px", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}><Zap size={19} /> Números do bot por departamento</h2>
                  <p style={{ color: "#657887", fontSize: "13px", lineHeight: 1.5 }}>Configure qual número o cliente deve enviar para cada encaminhamento. Um mesmo número pode encaminhar para vários departamentos: basta selecionar mais de um na mesma linha.</p>
                  <div style={{ display: "grid", gap: "12px" }}>
                    {botMappings.map((mapping, index) => (
                      <div key={`mapping-${index}`} style={{ border: "1px solid #e0e7ed", borderRadius: "12px", padding: "12px", display: "grid", gap: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <label style={{ ...adminLabelStyle, flex: 1 }}>Número da resposta
                            <input inputMode="numeric" pattern="[0-9]{1,3}" value={mapping.number} onChange={e => updateBotMapping(index, { number: e.target.value.replace(/\D/g, "").slice(0, 3) })} style={adminInputStyle} placeholder="1" />
                          </label>
                          <button type="button" onClick={() => setBotMappings(items => items.filter((_, i) => i !== index))} title="Remover opção" style={{ ...adminIconButtonStyle, color: "#b42318", marginTop: "18px" }}><Trash2 size={17} /></button>
                        </div>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#334c5e" }}>Departamentos vinculados a esse número</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "7px" }}>
                          {adminDepartments.filter(d => d.active).map(department => (
                            <label key={department.id} style={{ display: "flex", alignItems: "center", gap: "8px", border: "1px solid #e4eaf0", borderRadius: "8px", padding: "8px", fontSize: "12px", color: "#294456" }}>
                              <input type="checkbox" checked={mapping.department_ids.includes(Number(department.id))} onChange={e => updateBotMapping(index, { department_ids: e.target.checked ? [...mapping.department_ids, Number(department.id)] : mapping.department_ids.filter(id => id !== Number(department.id)) })} />
                              {department.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button type="button" onClick={addBotMappingRow} style={adminButtonStyle("secondary")}><Plus size={16} /> Adicionar número</button>
                      <button type="button" onClick={saveBotMappings} style={adminButtonStyle("primary")}><Save size={16} /> Salvar configuração</button>
                    </div>
                  </div>
                  <p style={{ color: "#657887", fontSize: "12px", marginTop: "14px" }}>O bot enviará uma única mensagem com os números configurados e aguardará a resposta. A conversa será vinculada a todos os departamentos selecionados para o número escolhido.</p>
                </section>
                <section style={adminCardStyle}>
                  <h2 style={{ margin: "0 0 8px", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}><Zap size={19} /> Mensagens prontas</h2>
                  <p style={{ color: "#657887", fontSize: "13px", lineHeight: 1.5 }}>Cadastre respostas frequentes. Os colaboradores acessam pelo ícone de raio ao lado do clipe de mídia; ao selecionar uma mensagem, ela entra no campo de texto para revisão e envio.</p>
                  <form onSubmit={createQuickReply} style={{ display: "grid", gap: "10px", marginBottom: "16px" }}>
                    <label style={adminLabelStyle}>Título
                      <input required maxLength={120} value={newQuickReplyTitle} onChange={e => setNewQuickReplyTitle(e.target.value)} style={adminInputStyle} placeholder="Ex.: Solicitação recebida" />
                    </label>
                    <label style={adminLabelStyle}>Texto da mensagem
                      <textarea required value={newQuickReplyBody} onChange={e => setNewQuickReplyBody(e.target.value)} style={{ ...adminInputStyle, minHeight: "110px", resize: "vertical" }} placeholder="Digite a mensagem pronta..." />
                    </label>
                    <button type="submit" style={{ ...adminButtonStyle("primary"), justifyContent: "center" }}><Plus size={16} /> Salvar mensagem pronta</button>
                  </form>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {quickReplies.map(reply => <div key={reply.id} style={{ border: "1px solid #e0e7ed", borderRadius: "10px", padding: "10px", display: "flex", alignItems: "start", gap: "10px" }}><div style={{ flex: 1, minWidth: 0 }}><strong>{reply.title}</strong><div style={{ fontSize: "12px", color: "#657887", whiteSpace: "pre-wrap", marginTop: "4px" }}>{reply.body}</div></div><button type="button" onClick={() => deleteQuickReply(reply)} title="Remover mensagem" style={{ ...adminIconButtonStyle, color: "#b42318" }}><Trash2 size={16} /></button></div>)}
                    {!quickReplies.length && <p style={{ color: "#657887", fontSize: "13px" }}>Nenhuma mensagem pronta cadastrada.</p>}
                  </div>
                </section>
              </div>
            ) : adminView === "users" ? (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 0.8fr) minmax(420px, 1.5fr)", gap: "18px", alignItems: "start" }}>
                <section style={adminCardStyle}>
                  <h2 style={{ margin: "0 0 6px", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <UserPlus size={19} /> Novo usuário
                  </h2>
                  <p style={{ margin: "0 0 18px", color: "#657887", fontSize: "12px" }}>
                    A senha será armazenada como hash pelo servidor.
                  </p>
                  <form onSubmit={createUser} style={{ display: "grid", gap: "12px" }}>
                    <label style={adminLabelStyle}>Nome
                      <input required value={newUser.name} onChange={e => setNewUser(v => ({ ...v, name: e.target.value }))} style={adminInputStyle} placeholder="Nome do colaborador" />
                    </label>
                    <label style={adminLabelStyle}>E-mail
                      <input required type="email" value={newUser.email} onChange={e => setNewUser(v => ({ ...v, email: e.target.value }))} style={adminInputStyle} placeholder="nome@empresa.com.br" />
                    </label>
                    <label style={adminLabelStyle}>Senha inicial
                      <input required minLength={8} type="password" value={newUser.password} onChange={e => setNewUser(v => ({ ...v, password: e.target.value }))} style={adminInputStyle} placeholder="Mínimo de 8 caracteres" />
                    </label>
                    <label style={adminLabelStyle}>Perfil
                      <select value={newUser.role} onChange={e => setNewUser(v => ({ ...v, role: e.target.value }))} style={adminInputStyle}>
                        <option value="agent">Colaborador</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </label>
                    <label style={adminLabelStyle}>Departamento
                      <select value={newUser.department_id} onChange={e => setNewUser(v => ({ ...v, department_id: e.target.value }))} style={adminInputStyle}>
                        <option value="">Sem departamento</option>
                        {adminDepartments.filter(d => d.active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </label>
                    <button type="submit" style={{ ...adminButtonStyle("primary"), justifyContent: "center", padding: "11px" }}>
                      <Plus size={17} /> Criar usuário
                    </button>
                  </form>
                </section>

                <section style={adminCardStyle}>
                  <h2 style={{ margin: "0 0 14px", fontSize: "18px" }}>Usuários cadastrados</h2>
                  <div style={{ display: "grid", gap: "10px" }}>
                    {adminUsers.map(item => (
                      <div key={item.id} style={{ border: "1px solid #e0e7ed", borderRadius: "12px", padding: "13px", background: item.active ? "#fff" : "#f7f8fa" }}>
                        {editingUserId === item.id ? (
                          <form onSubmit={saveEditedUser} style={{ display: "grid", gap: "10px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
                              <label style={adminLabelStyle}>Nome
                                <input required value={editingUserForm.name} onChange={e => setEditingUserForm(v => ({ ...v, name: e.target.value }))} style={adminInputStyle} />
                              </label>
                              <label style={adminLabelStyle}>E-mail
                                <input required type="email" value={editingUserForm.email} onChange={e => setEditingUserForm(v => ({ ...v, email: e.target.value }))} style={adminInputStyle} />
                              </label>
                              <label style={adminLabelStyle}>Perfil
                                <select value={editingUserForm.role} onChange={e => setEditingUserForm(v => ({ ...v, role: e.target.value }))} style={adminInputStyle}>
                                  <option value="agent">Colaborador</option>
                                  <option value="admin">Administrador</option>
                                </select>
                              </label>
                              <label style={adminLabelStyle}>Departamento
                                <select value={editingUserForm.department_id} onChange={e => setEditingUserForm(v => ({ ...v, department_id: e.target.value }))} style={adminInputStyle}>
                                  <option value="">Sem departamento</option>
                                  {adminDepartments.filter(d => d.active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                              </label>
                            </div>
                            <label style={adminLabelStyle}>Nova senha (opcional)
                              <input minLength={8} type="password" value={editingUserForm.password} onChange={e => setEditingUserForm(v => ({ ...v, password: e.target.value }))} style={adminInputStyle} placeholder="Deixe vazio para manter a senha atual" />
                            </label>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              <button type="submit" style={adminButtonStyle("primary")}><Save size={15} /> Salvar</button>
                              <button type="button" onClick={() => setEditingUserId(null)} style={adminButtonStyle("secondary")}>Cancelar</button>
                            </div>
                          </form>
                        ) : (
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                            <div style={{ minWidth: "180px", flex: 1 }}>
                              <div style={{ fontWeight: 700 }}>{item.name} {item.id === user.id ? "(você)" : ""}</div>
                              <div style={{ color: "#657887", fontSize: "12px", marginTop: "3px" }}>{item.email}</div>
                              <div style={{ color: "#657887", fontSize: "12px", marginTop: "5px" }}>
                                {item.role === "admin" ? "Administrador" : "Colaborador"} · {adminDepartments.find(d => d.id === item.department_id)?.name || "Sem departamento"}
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}>
                              <span style={{ padding: "4px 8px", borderRadius: "999px", fontSize: "11px", background: item.active ? "#e7f7ee" : "#eceff2", color: item.active ? "#187343" : "#63717d" }}>
                                {item.active ? "Ativo" : "Inativo"}
                              </span>
                              <button type="button" title="Editar usuário" onClick={() => startEditUser(item)} style={adminIconButtonStyle}><Pencil size={15} /></button>
                              <button type="button" title={item.active ? "Desativar usuário" : "Ativar usuário"} onClick={() => toggleUser(item)} style={adminIconButtonStyle}><Power size={15} /></button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {!adminLoading && adminUsers.length === 0 && <p style={{ color: "#657887" }}>Nenhum usuário cadastrado.</p>}
                  </div>
                </section>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 0.7fr) minmax(400px, 1.3fr)", gap: "18px", alignItems: "start" }}>
                <section style={adminCardStyle}>
                  <h2 style={{ margin: "0 0 16px", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Building2 size={19} /> Novo departamento
                  </h2>
                  <form onSubmit={createDepartment} style={{ display: "grid", gap: "12px" }}>
                    <label style={adminLabelStyle}>Nome do departamento
                      <input required value={newDepartmentName} onChange={e => setNewDepartmentName(e.target.value)} style={adminInputStyle} placeholder="Ex.: Fiscal, DP, Financeiro" />
                    </label>
                    <button type="submit" style={{ ...adminButtonStyle("primary"), justifyContent: "center", padding: "11px" }}>
                      <Plus size={17} /> Criar departamento
                    </button>
                  </form>
                </section>

                <section style={adminCardStyle}>
                  <h2 style={{ margin: "0 0 14px", fontSize: "18px" }}>Departamentos cadastrados</h2>
                  <div style={{ display: "grid", gap: "10px" }}>
                    {adminDepartments.map(department => (
                      <div key={department.id} style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", border: "1px solid #e0e7ed", borderRadius: "12px", padding: "14px", background: "#fff", flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{department.name}</div>
                          <div style={{ color: "#657887", fontSize: "12px", marginTop: "4px" }}>{department.active ? "Ativo" : "Inativo"}</div>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button type="button" onClick={() => renameDepartment(department)} style={adminButtonStyle("secondary")}><Pencil size={15} /> Renomear</button>
                          <button type="button" onClick={() => toggleDepartment(department)} style={adminButtonStyle("secondary")}><Power size={15} /> {department.active ? "Desativar" : "Ativar"}</button>
                        </div>
                      </div>
                    ))}
                    {!adminLoading && adminDepartments.length === 0 && <p style={{ color: "#657887" }}>Nenhum departamento cadastrado.</p>}
                  </div>
                </section>
              </div>
            )}
            <p style={{ color: "#718391", fontSize: "12px", marginTop: "22px" }}>
              As alterações de acesso são verificadas pelo backend. Desativar uma conta impede novos acessos, sem apagar o histórico.
            </p>
          </div>
        </div>
      )}

      {newConversationOpen && (
        <div
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !newConversationLoading) {
              setNewConversationOpen(false);
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(8, 20, 31, 0.58)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "18px",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-conversation-title"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              maxHeight: "min(760px, 92vh)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              background: darkMode ? "#202833" : "#ffffff",
              color: darkMode ? "#f2f6fa" : "#1b2d3d",
              borderRadius: "16px",
              boxShadow: "0 22px 70px rgba(0,0,0,0.28)",
              border: darkMode ? "1px solid #3a4654" : "1px solid #dfe7ed",
            }}
          >
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              padding: "18px 20px",
              borderBottom: darkMode ? "1px solid #3a4654" : "1px solid #e5ebf0",
            }}>
              <div>
                <h2 id="new-conversation-title" style={{ margin: 0, fontSize: "18px" }}>
                  Nova conversa
                </h2>
                <p style={{ margin: "5px 0 0", fontSize: "12px", opacity: 0.72 }}>
                  Escolha um contato salvo ou informe um número.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setNewConversationOpen(false)}
                disabled={newConversationLoading}
                style={{
                  border: 0,
                  background: "transparent",
                  color: "inherit",
                  cursor: "pointer",
                  padding: "6px",
                  display: "inline-flex",
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: "16px 20px", overflowY: "auto", display: "grid", gap: "16px" }}>
              <div>
                <label htmlFor="whatsapp-contact-search" style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "7px" }}>
                  Contatos do WhatsApp
                </label>
                <div style={{ position: "relative" }}>
                  <Search size={16} style={{ position: "absolute", left: "11px", top: "12px", opacity: 0.6 }} />
                  <input
                    id="whatsapp-contact-search"
                    value={contactSearch}
                    onChange={(event) => setContactSearch(event.target.value)}
                    placeholder="Pesquisar nome ou telefone..."
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "10px 12px 10px 34px",
                      border: darkMode ? "1px solid #465363" : "1px solid #d5dfe7",
                      borderRadius: "9px",
                      background: darkMode ? "#151c25" : "#ffffff",
                      color: "inherit",
                      font: "inherit",
                      outlineColor: "#16a085",
                    }}
                  />
                </div>
                <div style={{
                  marginTop: "8px",
                  maxHeight: "220px",
                  overflowY: "auto",
                  border: darkMode ? "1px solid #3a4654" : "1px solid #e1e8ee",
                  borderRadius: "10px",
                }}>
                  {contactsLoading && (
                    <p style={{ padding: "14px", margin: 0, fontSize: "13px", opacity: 0.72 }}>
                      Carregando contatos...
                    </p>
                  )}
                  {!contactsLoading && contactsError && (
                    <p style={{ padding: "12px 14px", margin: 0, color: "#c65a52", fontSize: "12px" }}>
                      {contactsError}
                    </p>
                  )}
                  {!contactsLoading && !contactsError && whatsappContacts.filter((contact) => {
                    const term = contactSearch.trim().toLowerCase();
                    return !term ||
                      String(contact.name || "").toLowerCase().includes(term) ||
                      String(contact.phone || "").includes(term);
                  }).length === 0 && (
                    <p style={{ padding: "14px", margin: 0, fontSize: "13px", opacity: 0.72 }}>
                      Nenhum contato encontrado. Você pode usar o número abaixo.
                    </p>
                  )}
                  {!contactsLoading && whatsappContacts
                    .filter((contact) => {
                      const term = contactSearch.trim().toLowerCase();
                      return !term ||
                        String(contact.name || "").toLowerCase().includes(term) ||
                        String(contact.phone || "").includes(term);
                    })
                    .map((contact) => (
                      <button
                        key={`${contact.phone}-${contact.name}`}
                        type="button"
                        onClick={() => startNewConversation(contact.phone, contact.name)}
                        disabled={newConversationLoading}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "11px",
                          width: "100%",
                          padding: "11px 13px",
                          textAlign: "left",
                          border: 0,
                          borderBottom: darkMode ? "1px solid #303b48" : "1px solid #edf1f4",
                          background: "transparent",
                          color: "inherit",
                          cursor: newConversationLoading ? "wait" : "pointer",
                        }}
                      >
                        <span style={{
                          width: "34px",
                          height: "34px",
                          flex: "0 0 34px",
                          borderRadius: "50%",
                          display: "grid",
                          placeItems: "center",
                          background: darkMode ? "#344351" : "#e7f4f2",
                          color: darkMode ? "#bcebe2" : "#147d70",
                        }}>
                          <UserPlus size={17} />
                        </span>
                        <span style={{ minWidth: 0, display: "grid", gap: "3px" }}>
                          <strong style={{ fontSize: "13px", overflowWrap: "anywhere" }}>
                            {contact.name || contact.phone}
                          </strong>
                          <span style={{ fontSize: "12px", opacity: 0.68 }}>
                            {contact.phone}
                          </span>
                        </span>
                      </button>
                    ))}
                </div>
              </div>

              <div style={{
                paddingTop: "15px",
                borderTop: darkMode ? "1px solid #3a4654" : "1px solid #e5ebf0",
              }}>
                <h3 style={{ margin: "0 0 10px", fontSize: "14px" }}>
                  Iniciar por número
                </h3>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    startNewConversation(manualPhone, manualContactName);
                  }}
                  style={{ display: "grid", gap: "9px" }}
                >
                  <input
                    value={manualContactName}
                    onChange={(event) => setManualContactName(event.target.value)}
                    placeholder="Nome do contato (opcional)"
                    maxLength={120}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "10px 11px",
                      border: darkMode ? "1px solid #465363" : "1px solid #d5dfe7",
                      borderRadius: "9px",
                      background: darkMode ? "#151c25" : "#ffffff",
                      color: "inherit",
                      font: "inherit",
                    }}
                  />
                  <input
                    value={manualPhone}
                    onChange={(event) => setManualPhone(event.target.value)}
                    placeholder="Ex.: 5521999999999"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "10px 11px",
                      border: darkMode ? "1px solid #465363" : "1px solid #d5dfe7",
                      borderRadius: "9px",
                      background: darkMode ? "#151c25" : "#ffffff",
                      color: "inherit",
                      font: "inherit",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={newConversationLoading}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      padding: "11px 14px",
                      border: 0,
                      borderRadius: "9px",
                      background: "#102d46",
                      color: "#ffffff",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: newConversationLoading ? "wait" : "pointer",
                      opacity: newConversationLoading ? 0.7 : 1,
                    }}
                  >
                    <MessageCircle size={17} />
                    {newConversationLoading ? "Abrindo conversa..." : "Iniciar conversa"}
                  </button>
                </form>
                <p style={{ margin: "8px 0 0", fontSize: "11px", opacity: 0.68 }}>
                  Digite o número com DDI e DDD, somente números. Exemplo: 5521999999999.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}

    </div>
  );
}

const adminCardStyle = {
  background: "#ffffff",
  border: "1px solid #e1e8ee",
  borderRadius: "16px",
  padding: "20px",
  boxShadow: "0 4px 18px rgba(21, 44, 61, 0.04)",
  minWidth: 0,
};

const adminLabelStyle = {
  display: "grid",
  gap: "6px",
  color: "#334c5e",
  fontSize: "12px",
  fontWeight: 700,
};

const adminInputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 11px",
  border: "1px solid #d5dfe7",
  borderRadius: "8px",
  background: "#fff",
  color: "#172b3a",
  font: "inherit",
  fontWeight: 400,
  outlineColor: "#2b8795",
};

const adminIconButtonStyle = {
  border: "1px solid #d5dfe7",
  borderRadius: "8px",
  background: "#fff",
  color: "#334c5e",
  cursor: "pointer",
  padding: "8px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

function adminButtonStyle(variant) {
  const primary = variant === "primary";
  return {
    border: primary ? "1px solid #102d46" : "1px solid #d5dfe7",
    borderRadius: "9px",
    background: primary ? "#102d46" : "#fff",
    color: primary ? "#fff" : "#294456",
    cursor: "pointer",
    padding: "9px 12px",
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    fontSize: "12px",
    fontWeight: 700,
  };
}

export default App;