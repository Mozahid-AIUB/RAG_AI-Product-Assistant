import { Body, Controller, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AskDto } from './ask.dto';
import { AskService } from './ask.service';

@ApiTags('ask')
@Controller()
export class AskController {
  constructor(private readonly askService: AskService) {}

  @Post('ask')
  @ApiOperation({
    summary: 'Ask a question about the product catalogue',
    description:
      'Answers are grounded strictly in the catalogue. If nothing matches confidently, the response comes back with found: false instead of a guess.',
  })
  @ApiQuery({
    name: 'debug',
    required: false,
    description: 'Set to "true" to include the matched products and their similarity scores',
  })
  @ApiResponse({
    status: 200,
    description: 'Answer generated from the catalogue, or a not-available response',
    schema: {
      example: {
        found: true,
        answer: 'The Anker PowerCore 10000mAh Power Bank is priced at 2650 BDT.',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Missing or empty question' })
  async ask(@Body() body: AskDto, @Query('debug') debug?: string) {
    return this.askService.ask(body.question, debug === 'true');
  }
}
