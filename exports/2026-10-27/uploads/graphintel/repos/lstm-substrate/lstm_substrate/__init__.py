"""anima/lstm-substrate: an LSTM rung for Bridago, CPU only."""
from .lstm import LSTM, Adam, sigmoid
from .substrate import LSTMSubstrate

__all__ = ["LSTM", "Adam", "LSTMSubstrate", "sigmoid"]
__version__ = "0.1.0"
