import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ProductsModule } from '../products/products.module';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';

@Module({
  imports: [AiModule, ProductsModule],
  controllers: [AskController],
  providers: [AskService],
})
export class AskModule {}
