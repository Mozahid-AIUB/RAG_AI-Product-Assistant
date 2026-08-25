import { Module } from '@nestjs/common';
import { KnowledgeBaseStore } from './knowledge-base.store';
import { RetrievalService } from './retrieval.service';

@Module({
  providers: [KnowledgeBaseStore, RetrievalService],
  exports: [KnowledgeBaseStore, RetrievalService],
})
export class ProductsModule {}
