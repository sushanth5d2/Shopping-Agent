"""Dedicated production monitoring worker.
Runs server-side monitoring independently from API replicas so monitoring continues
when browsers/mobile apps are closed and never runs twice across worker replicas.
"""
import time
from .scheduler import start_scheduler, stop_scheduler

def main():
    start_scheduler()
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        pass
    finally:
        stop_scheduler()

if __name__ == '__main__':
    main()
