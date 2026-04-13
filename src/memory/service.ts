import { querySemanticMemory, storeSemanticMemory } from "./pinecone";
import { logActivity as logPostgresActivity, queryAnalytics as queryPostgresAnalytics } from "./postgres";
import {
  dbQueries,
  type DocumentRecord,
  type DocumentSearchResult,
  type MessageRecord,
  type SessionRecord,
  type SessionType,
  type TranscriptSearchResult,
  type WorkflowRunRecord,
  type WorkflowStepRecord,
} from "./sqlite";

type CreateSessionInput = {
  id: string;
  title: string;
  type: SessionType;
  role?: string | null;
  status?: string;
  parentSessionId?: string | null;
  modelOverride?: string | null;
  lastModelUsed?: string | null;
  instructions?: string | null;
  allowedTools?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

export class DefaultMemoryService {
  createSession(input: CreateSessionInput): SessionRecord {
    return dbQueries.createSession(input);
  }

  getSession(id: string) {
    return dbQueries.getSession(id);
  }

  listSessions() {
    return dbQueries.listSessions();
  }

  updateSession(id: string, updates: Partial<CreateSessionInput>) {
    return dbQueries.updateSession(id, updates);
  }

  touchSession(id: string, lastModelUsed?: string | null) {
    dbQueries.touchSession(id, lastModelUsed);
  }

  addMessage(role: "user" | "model", content: string, options?: {
    sessionId?: string;
    modelUsed?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    dbQueries.addMessage(role, content, options);
  }

  addDocument(input: {
    sessionId?: string;
    filename: string;
    mediaType?: string | null;
    content: string;
    metadata?: Record<string, unknown> | null;
  }): DocumentRecord {
    return dbQueries.addDocument(input);
  }

  getRecentDocuments(sessionId?: string, limit?: number): DocumentRecord[] {
    return dbQueries.getRecentDocuments(sessionId, limit);
  }

  getRecentMessages(sessionId?: string, limit?: number): MessageRecord[] {
    return dbQueries.getRecentMessages(sessionId, limit);
  }

  getSessionHistory(sessionId: string, limit = 20): MessageRecord[] {
    return dbQueries.getSessionHistory(sessionId, limit);
  }

  getMessagesBatch(sessionId: string, offset: number, limit: number): MessageRecord[] {
    return dbQueries.getMessagesBatch(sessionId, offset, limit);
  }

  getMessageCount(sessionId?: string) {
    return dbQueries.getMessageCount(sessionId);
  }

  getSummarizedMessageCount(sessionId?: string) {
    return dbQueries.getSummarizedMessageCount(sessionId);
  }

  getOldestMessages(sessionId?: string, limit?: number): MessageRecord[] {
    return dbQueries.getOldestMessages(sessionId, limit);
  }

  moveSessionData(sourceSessionId: string, targetSessionId: string) {
    return dbQueries.moveSessionData(sourceSessionId, targetSessionId);
  }

  addCoreFact(fact: string) {
    dbQueries.addCoreFact(fact);
  }

  getCoreFacts() {
    return dbQueries.getCoreFacts();
  }

  deleteCoreFact(id: number) {
    dbQueries.deleteCoreFact(id);
  }

  updateCoreFact(id: number, newFact: string) {
    dbQueries.updateCoreFact(id, newFact);
  }

  addSummary(summary: string, coveredMessagesCount: number, sessionId?: string) {
    dbQueries.addSummary(summary, coveredMessagesCount, sessionId);
  }

  getLatestSummary(sessionId?: string) {
    return dbQueries.getLatestSummary(sessionId);
  }

  searchConversationHistory(query: string, limit = 5): TranscriptSearchResult[] {
    return dbQueries.searchConversationHistory(query, limit);
  }

  searchDocuments(query: string, limit = 5, sessionId?: string): DocumentSearchResult[] {
    return dbQueries.searchDocuments(query, limit, sessionId);
  }

  async searchSemanticMemory(query: string, topK = 3) {
    return querySemanticMemory(query, topK);
  }

  async storeSemanticMemory(id: string, payload: string) {
    return storeSemanticMemory(id, payload);
  }

  async logActivity(action: string, details: string, status = "success") {
    return logPostgresActivity(action, details, status);
  }

  async queryAnalytics(sql: string) {
    return queryPostgresAnalytics(sql);
  }

  addScheduledTask(cronExpression: string, prompt: string, deliverTo: string = "auto") {
    return dbQueries.addScheduledTask(cronExpression, prompt, deliverTo);
  }

  getScheduledTasks() {
    return dbQueries.getScheduledTasks();
  }

  deleteScheduledTask(id: number) {
    dbQueries.deleteScheduledTask(id);
  }

  createWorkflowRun(input: {
    id: string;
    goal: string;
    status: string;
    modelUsed: string;
    sessionId: string;
    metadata?: Record<string, unknown> | null;
  }): WorkflowRunRecord {
    return dbQueries.createWorkflowRun(input);
  }

  getWorkflowRun(id: string) {
    return dbQueries.getWorkflowRun(id);
  }

  updateWorkflowRun(id: string, updates: {
    status?: string;
    metadata?: Record<string, unknown> | null;
  }): WorkflowRunRecord | null {
    return dbQueries.updateWorkflowRun(id, updates);
  }

  createWorkflowStep(input: {
    id: string;
    workflowId: string;
    stepOrder: number;
    title: string;
    ownerRole: string;
    dependsOn: string[];
    successCriteria: string;
    expectedArtifact?: string | null;
    status: string;
    outputSessionId?: string | null;
    resultSummary?: string | null;
    metadata?: Record<string, unknown> | null;
  }): WorkflowStepRecord {
    return dbQueries.createWorkflowStep(input);
  }

  getWorkflowSteps(workflowId: string) {
    return dbQueries.getWorkflowSteps(workflowId);
  }

  updateWorkflowStep(id: string, updates: {
    status?: string;
    outputSessionId?: string | null;
    resultSummary?: string | null;
    metadata?: Record<string, unknown> | null;
  }): WorkflowStepRecord | null {
    return dbQueries.updateWorkflowStep(id, updates);
  }
}
