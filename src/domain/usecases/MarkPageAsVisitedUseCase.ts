import { PageVisitedRepository } from "../repositories/PageVisitedRepository";

export class MarkPageAsVisitedUseCase {
    constructor(private repositories: { pageVisitedRepository: PageVisitedRepository }) {}

    async execute(key: string) {
        return this.repositories.pageVisitedRepository.markAsVisited(key);
    }
}
