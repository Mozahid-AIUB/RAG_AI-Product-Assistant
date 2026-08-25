import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AskDto {
  @ApiProperty({
    example: 'How much is the Anker PowerCore 10000mAh?',
    description: 'A plain-English question about a product in the catalogue',
  })
  @IsString()
  @IsNotEmpty()
  question: string;
}
