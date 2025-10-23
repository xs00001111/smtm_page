import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import type { Card } from '@smtm/shared/types';

export class NotificationService {
  private bot: Telegraf;

  constructor(bot: Telegraf) {
    this.bot = bot;
  }

  async sendCard(userId: number, card: Card) {
    try {
      let message = `📊 ${card.title}\n\n`;

      card.lines.forEach((line) => {
        message += `${line}\n`;
      });

      if (card.footer) {
        message += `\n${card.footer}`;
      }

      if (card.url) {
        message += `\n\n🔗 ${card.url}`;
      }

      await this.bot.telegram.sendMessage(userId, message);
      logger.info('Sent card notification', { userId, title: card.title });
    } catch (error) {
      logger.error('Failed to send card notification', { userId, error });
      throw error;
    }
  }

  async sendCards(userId: number, cards: Card[]) {
    for (const card of cards) {
      await this.sendCard(userId, card);
      // Small delay to avoid rate limiting
      await this.delay(100);
    }
  }

  async sendMessage(userId: number, text: string) {
    try {
      await this.bot.telegram.sendMessage(userId, text);
      logger.info('Sent message', { userId });
    } catch (error) {
      logger.error('Failed to send message', { userId, error });
      throw error;
    }
  }

  async sendError(userId: number, error: string) {
    const message = `❌ Error: ${error}`;
    await this.sendMessage(userId, message);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
