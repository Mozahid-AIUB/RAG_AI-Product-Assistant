import { Body, Controller, Post, Query } from '@nestjs/common';
import { AskDto } from './ask.dto';
import { AskService } from './ask.service';

@Controller()
export class AskController {
  constructor(private readonly askService: AskService) {}

  @Post('ask')
  async ask(@Body() body: AskDto, @Query('debug') debug?: string) {
    return this.askService.ask(body.question, debug === 'true');
  }
}
