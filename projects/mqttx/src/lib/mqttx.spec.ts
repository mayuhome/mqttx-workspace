import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Mqttx } from './mqttx';

describe('Mqttx', () => {
  let component: Mqttx;
  let fixture: ComponentFixture<Mqttx>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Mqttx],
    }).compileComponents();

    fixture = TestBed.createComponent(Mqttx);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
