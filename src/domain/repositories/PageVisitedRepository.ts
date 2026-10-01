export interface PageVisitedRepository {
    markAsVisited(key: string): Promise<{ previousValue: boolean }>;
}
