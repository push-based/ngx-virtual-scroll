import { moveItemInArray } from '@angular/cdk/drag-drop';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { faker } from '@faker-js/faker';

export interface Item {
  id: number;
  value: string;
  content: string;
  date: Date;
  user: string;
  image: string;
  status: string;
  description: string;
}

const users = [
  'julian.jandl@push-based.io',
  'vojtec.masek@push-based.io',
  'michael.hladky@push-based.io',
  'anton.efanov@push-based.io',
  'kirill.karnaukhov@push-based.io',
  'edouard.bozon@push-based.io',
  'enea.jahollari@push-based.io',
  'christopher.holder@push-based.io',
];

const status = ['done', 'pending', 'block'];

function randomStatus(): '✔️' | '🌟' | '❌' {
  const betweenZeroAndTwo = Math.floor(Math.random() * 3);
  return status[betweenZeroAndTwo] as '✔️' | '🌟' | '❌';
}

export function randomContent(minLength = 1, maxLength = 50) {
  return faker.word.words({ count: { min: minLength, max: maxLength } });
}

function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function generateItems(startId: number, amount: number): Item[] {
  return new Array(amount).fill(0).map((v, i) => ({
    id: startId + i,
    value: `value ${startId + i}`,
    content: randomContent(),
    user: users[randomIntFromInterval(0, users.length - 1)],
    image: faker.image.urlLoremFlickr({ category: 'technics' }),
    status: randomStatus(),
    date: faker.date.anytime(),
    description: Math.random() >= 0.5 ? randomContent(20, 50) : '',
  }));
}

const startItems = generateItems(0, 30000);

@Injectable()
export class DataService {
  items = [...startItems];

  items$ = new BehaviorSubject<Item[]>(this.items);

  addItems(amount: number | string) {
    if (typeof amount === 'string') {
      amount = parseInt(amount);
    }
    if (this.items.length + amount <= 100000) {
      this.items = this.items.concat(
        ...generateItems(this.items.length, amount),
      );
      this.items$.next(this.items);
    }
  }

  setItems(items: Item[]) {
    this.items = items;
    this.items$.next(items);
  }

  init(amount: number) {
    this.items = generateItems(0, amount);
    this.items$.next(this.items);
  }

  shuffle(): void {
    this.items = [...this.items.sort(() => Math.random() - 0.5)];
    this.items$.next(this.items);
  }

  removeItem(item: Item): void {
    this.items = this.items.filter((i) => i !== item);
    this.items$.next(this.items);
  }

  moveItem(item: Item, from: number, to: number): void {
    moveItemInArray(this.items, from, to);
    this.items$.next(this.items);
  }

  updateItem(item: Item): void {
    this.items = this.items.map((i) => {
      if (i.id !== item.id) {
        return i;
      }
      return {
        ...item,
        status: randomStatus(),
        content: randomContent(),
      };
    });
    this.items$.next(this.items);
  }

  trackItem = (i: number, item: Item) => item.id;
}
